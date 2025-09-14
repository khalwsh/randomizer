(() => {
    const $ = id => document.getElementById(id);
    const itemsTxt = $('itemsTxt');
    const addItemsBtn = $('addItemsBtn');
    const clearItemsBtn = $('clearItemsBtn');
    const itemsList = $('itemsList');
    const itemA = $('itemA');
    const itemB = $('itemB');
    const addPairBtn = $('addPairBtn');
    const pairsList = $('pairsList');
    const numGroupsInput = $('numGroups');
    const allowNearCheckbox = $('allowNear');
    const generateBtn = $('generateBtn');
    const errorEl = $('error');
    const resultsEl = $('results');
    const itemsCountEl = $('itemsCount');
    const randomizeNamesBtn = $('randomizeNamesBtn');
    const downloadAllBtn = $('downloadAllBtn');

    let items = [];
    let pairs = [];

    function escapeHtml(s) {
        return (s + '').replace(/[&<>"']/g, c => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        } [c]));
    }

    function showError(msg) {
        errorEl.textContent = msg || '';
    }

    function renderItems() {
        itemsList.innerHTML = '';
        items.forEach((name, idx) => {
            const tag = document.createElement('div');
            tag.className = 'tag';
            tag.innerHTML = `<span title="${escapeHtml(name)}">${escapeHtml(name)}</span><button aria-label="remove ${escapeHtml(name)}" data-idx="${idx}">×</button>`;
            itemsList.appendChild(tag);
        });
        itemsCountEl.textContent = items.length;
        updateSelects();
    }

    function updateSelects() {
        const fill = (sel) => {
            const prev = sel.value;
            sel.innerHTML = '<option value="">Choose...</option>';
            items.forEach(it => {
                const o = document.createElement('option');
                o.value = it;
                o.textContent = it;
                sel.appendChild(o);
            });
            if (items.includes(prev)) sel.value = prev;
        };
        fill(itemA);
        fill(itemB);
    }

    function renderPairs() {
        pairsList.innerHTML = '';
        pairs.forEach((p, idx) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${escapeHtml(p[0])} ↔ ${escapeHtml(p[1])}</span><button data-idx="${idx}" class="btn secondary">Remove</button>`;
            pairsList.appendChild(li);
        });
    }

    // Item management
    addItemsBtn.addEventListener('click', () => {
        const raw = itemsTxt.value.trim();
        if (!raw) {
            showError('Type items first.');
            return;
        }
        showError('');
        const parts = raw.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
        for (const p of parts)
            if (!items.includes(p)) items.push(p);
        itemsTxt.value = '';
        renderItems();
        renderPairs();
    });

    clearItemsBtn.addEventListener('click', () => {
        if (!confirm('Clear all items and pairs?')) return;
        items = [];
        pairs = [];
        renderItems();
        renderPairs();
        resultsEl.innerHTML = '';
        showError('');
    });

    itemsList.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const idx = Number(btn.dataset.idx);
        if (!Number.isFinite(idx)) return;
        const name = items[idx];
        items.splice(idx, 1);
        pairs = pairs.filter(p => p[0] !== name && p[1] !== name);
        renderItems();
        renderPairs();
    });

    addPairBtn.addEventListener('click', () => {
        const a = itemA.value,
            b = itemB.value;
        showError('');
        if (!a || !b) {
            showError('Choose both items.');
            return;
        }
        if (a === b) {
            showError('Pair must be two different items.');
            return;
        }
        if (pairs.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a))) {
            showError('Pair exists.');
            return;
        }
        pairs.push([a, b]);
        renderPairs();
    });

    pairsList.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const idx = Number(btn.dataset.idx);
        if (!Number.isFinite(idx)) return;
        pairs.splice(idx, 1);
        renderPairs();
    });

    randomizeNamesBtn.addEventListener('click', () => {
        items = shuffleArray(items.slice());
        renderItems();
    });

    // DSU
    function DSU(n) {
        const p = Array.from({
            length: n
        }, (_, i) => i);
        const find = (x) => {
            if (p[x] === x) return x;
            p[x] = find(p[x]);
            return p[x];
        };
        const union = (a, b) => {
            const ra = find(a),
                rb = find(b);
            if (ra !== rb) p[rb] = ra;
        };
        return {
            find,
            union
        };
    }

    function buildComponents(itemsArr, pairsArr) {
        const idx = new Map(itemsArr.map((it, i) => [it, i]));
        const dsu = DSU(itemsArr.length);
        for (const [a, b] of pairsArr) {
            if (!idx.has(a) || !idx.has(b)) throw new Error('Pair refers to unknown item: ' + [a, b].join(', '));
            dsu.union(idx.get(a), idx.get(b));
        }
        const comps = new Map();
        for (let i = 0; i < itemsArr.length; i++) {
            const r = dsu.find(i);
            if (!comps.has(r)) comps.set(r, []);
            comps.get(r).push(itemsArr[i]);
        }
        return Array.from(comps.values());
    }

    // Packing / bin-packing backtracking
    function tryPackComponents(components, capacities, maxSolutions = 1, maxAttempts = 800) {
        // components: array of arrays (items); capacities: array of integers (capacities per group)
        // We'll try randomized order attempts to find up to maxSolutions distinct packings.
        const N = components.reduce((s, c) => s + c.length, 0);
        // Pre-check: any component larger than max capacity -> impossible
        const maxCap = Math.max(...capacities);
        for (const c of components)
            if (c.length > maxCap) return {
                solutions: [],
                reason: 'A component has size larger than any group capacity.'
            };

        // Sort components descending for better pruning
        const compObjsOrig = components.map((c, idx) => ({
            items: c.slice(),
            size: c.length,
            id: idx
        }));

        const solutions = [];
        const seen = new Set();
        let attempts = 0;

        // Helper: backtracking assignment
        function findOne(compOrder, caps) {
            const k = caps.length;
            const groups = Array.from({
                length: k
            }, () => []);
            const sums = Array.from({
                length: k
            }, () => 0);

            // symmetry-breaking: when placing into an empty bin, only allow first empty bin index among empties to avoid equivalent permutations
            const compCount = compOrder.length;

            const memo = new Map(); // optional memoization by state key to prune identical states

            function dfs(i) {
                if (i === compCount) {
                    return groups.map(g => g.slice());
                }
                const comp = compOrder[i];
                const key = i + '|' + sums.join(',');
                if (memo.has(key)) return null;
                // try bins in randomized order but with deterministic bias
                const binOrder = [...Array(k).keys()];
                // sort by remaining capacity (tight first) to help fill
                binOrder.sort((a, b) => {
                    const ra = caps[a] - sums[a],
                        rb = caps[b] - sums[b];
                    // try tighter bins first
                    if (ra !== rb) return ra - rb;
                    return a - b;
                });
                for (const j of binOrder) {
                    if (sums[j] + comp.size > caps[j]) continue;
                    // symmetry: if this bin is empty and there exists a previous empty bin with smaller index, skip to avoid symmetric duplicates
                    if (sums[j] === 0) {
                        let earlierEmpty = false;
                        for (let e = 0; e < j; e++)
                            if (sums[e] === 0) {
                                earlierEmpty = true;
                                break;
                            }
                        if (earlierEmpty) continue;
                    }
                    // place
                    sums[j] += comp.size;
                    groups[j].push(...comp.items);
                    const res = dfs(i + 1);
                    if (res) return res;
                    // undo
                    for (let t = 0; t < comp.items.length; t++) groups[j].pop();
                    sums[j] -= comp.size;
                }
                memo.set(key, true);
                return null;
            }
            return dfs(0);
        }

        // try multiple attempts with shuffled orders/capacity permutations
        while (solutions.length < maxSolutions && attempts < maxAttempts) {
            attempts++;
            // shuffle components order (but keep sizes descending sometimes for speed)
            const shuffled = shuffleArray(compObjsOrig.slice());
            // sometimes keep descending to improve findability:
            if (Math.random() < 0.5) shuffled.sort((a, b) => b.size - a.size);

            // capacities: sometimes permute capacities for variety (for allow ±1 case where some bins larger)
            let caps = capacities.slice();
            if (Math.random() < 0.5) caps = shuffleArray(caps.slice());

            const sol = findOne(shuffled, caps);
            attempts++;
            if (sol) {
                // normalize solution representation: sort groups internally and then sort groups lexicographically to canonicalize
                const normalized = sol.map(g => g.slice()).map(g => g.sort()).sort((a, b) => a.join('|').localeCompare(b.join('|')));
                const key = JSON.stringify(normalized);
                if (!seen.has(key)) {
                    seen.add(key);
                    solutions.push(sol);
                }
            }
        }

        if (solutions.length === 0) {
            return {
                solutions: [],
                reason: 'No packing found (try allowing ±1 groups or reduce constraints).'
            };
        }
        return {
            solutions,
            attempts
        };
    }

    // generate groupings integrating everything
    function generateGroupings(itemsArr, pairsArr, k, allowNear = false, desired = 1) {
        if (itemsArr.length === 0) throw new Error('No items provided.');
        if (k < 1) throw new Error('Number of groups must be >= 1.');
        const components = buildComponents(itemsArr, pairsArr); // array of arrays
        const total = itemsArr.length;

        // determine capacities
        if (!allowNear) {
            if (total % k !== 0) throw new Error('Exact equal groups requested but total items (' + total + ') is not divisible by groups (' + k + '). Check "Allow ±1" to relax this.');
            const cap = total / k;
            const capacities = Array.from({
                length: k
            }, () => cap);
            const result = tryPackComponents(components, capacities, desired, 1200);
            if (result.solutions.length === 0) throw new Error(result.reason || 'Could not find packings.');
            while (result.solutions.length > 1) result.solutions.pop();
            return result.solutions;
        } else {
            // allow near-equal: some groups will have ceil(total/k) items, others floor(total/k).
            const low = Math.floor(total / k);
            const high = Math.ceil(total / k);
            // number of groups that must have high size:
            const r = total - low * k; // equivalently total % k
            // capacities: r groups with high, k-r groups with low
            const capacities = [];
            for (let i = 0; i < r; i++) capacities.push(high);
            for (let i = 0; i < k - r; i++) capacities.push(low);
            // It's beneficial to sort capacities descending (larger bins first), but try permutations inside tryPackComponents
            capacities.sort((a, b) => b - a);
            const result = tryPackComponents(components, capacities, desired, 1200);
            if (result.solutions.length === 0) throw new Error(result.reason || 'Could not find packings (even with ±1 allowance).');
            while (result.solutions.length > 1) result.solutions.pop();
            return result.solutions;
        }
    }

    // Generate button handler
    generateBtn.addEventListener('click', () => {
        showError('');
        resultsEl.innerHTML = '';
        const k = Number(numGroupsInput.value) || 0;
        const allowNear = allowNearCheckbox.checked;
        if (k < 1) {
            showError('Set number of groups to at least 1.');
            return;
        }
        if (items.length === 0) {
            showError('Add items first.');
            return;
        }
        try {
            const sols = generateGroupings(items, pairs, k, allowNear, 1);
            renderResults(sols);
        } catch (err) {
            showError(err.message || 'Error while generating groupings.');
        }
    });

    function renderResults(groupings) {
        resultsEl.innerHTML = '';
        groupings.forEach((g, i) => {
            const card = document.createElement('div');
            card.className = 'group-card';
            card.innerHTML = `<div class="group-title">Grouping</div>`;
            g.forEach((grp, gi) => {
                const div = document.createElement('div');
                div.className = 'group';
                div.innerHTML = `<strong>Group ${gi+1} (${grp.length})</strong><ul>${grp.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
                card.appendChild(div);
            });
            const toolbar = document.createElement('div');
            toolbar.style.marginTop = '8px';
            toolbar.style.display = 'flex';
            toolbar.style.gap = '8px';
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn secondary';
            copyBtn.textContent = 'Copy (text)';
            copyBtn.addEventListener('click', async () => {
                const text = g.map((grp, gi) => `Group ${gi+1} (${grp.length}): ${grp.join(', ')}`).join('\\n');
                try {
                    await navigator.clipboard.writeText(text);
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => copyBtn.textContent = 'Copy (text)', 1200);
                } catch (e) {
                    alert(text);
                }
            });
            const copyJsonBtn = document.createElement('button');
            copyJsonBtn.className = 'btn';
            copyJsonBtn.textContent = 'Copy JSON';
            copyJsonBtn.addEventListener('click', async () => {
                const obj = {
                    groups: g
                };
                try {
                    await navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
                    copyJsonBtn.textContent = 'Copied!';
                    setTimeout(() => copyJsonBtn.textContent = 'Copy JSON', 1200);
                } catch (e) {
                    alert(JSON.stringify(obj, null, 2));
                }
            });
            toolbar.appendChild(copyBtn);
            toolbar.appendChild(copyJsonBtn);
            card.appendChild(toolbar);
            resultsEl.appendChild(card);
        });
    }

    // download
    downloadAllBtn.addEventListener('click', () => {
        try {
            const k = Number(numGroupsInput.value) || 0;
            const allowNear = allowNearCheckbox.checked;
            if (k < 1) {
                showError('Set number of groups to at least 1.');
                return;
            }
            const sols = generateGroupings(items, pairs, k, allowNear, 1);
            const payload = {
                items,
                pairs,
                numGroups: k,
                allowNear,
                generatedAt: new Date().toISOString(),
                groupings: sols
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], {
                type: 'application/json'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'groupings.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            showError(err.message || 'Could not download.');
        }
    });

    // helpers
    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // init UI
    renderItems();
    renderPairs();

})();