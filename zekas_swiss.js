let players = [];
let rounds  = [];
let totalRounds = 0;
let currentRound = 0;
let currentPairings = []; 

function addPlayerRow(name = '', rating = '') {
  const list = document.getElementById('player-list');
  const row = document.createElement('div');
  row.className = 'player-row';
  row.innerHTML = `
    <input type="text" name="name" placeholder="Oyuncu Adı (Örn: Ali Yılmaz)" value="${name}">
    <input type="number" name="rating" placeholder="Puanı (İsteğe bağlı, örn: 1000)" value="${rating}" min="0" max="3500">
    <button class="btn-sm btn-del" onclick="this.parentElement.remove()" title="Oyuncuyu Sil">🗑️</button>
  `;
  list.appendChild(row);
  row.querySelector('input[name=name]').focus();
}

if (typeof document !== 'undefined') {
  for (let i = 0; i < 4; i++) addPlayerRow();
}

function startTournament() {
  const err = document.getElementById('setup-error');
  
  // Turnuva Bilgilerini Al ve Ekrana/Sekmeye Yazdır
  const gameName = document.getElementById('setup-game-name').value.trim() || 'Zeka Oyunları Turnuvası';
  const chiefRef = document.getElementById('setup-chief-ref').value.trim() || 'Belirtilmedi';
  const refs = document.getElementById('setup-refs').value.trim() || 'Belirtilmedi';

  const rows = document.querySelectorAll('#player-list .player-row');
  const raw = [];
  rows.forEach(r => {
    const name = r.querySelector('input[name=name]').value.trim();
    const rating = parseInt(r.querySelector('input[name=rating]').value) || 0;
    if (name) raw.push({ name, rating });
  });
  if (raw.length < 2) { err.textContent = 'Oynamak için en az 2 kişiye ihtiyaç var!'; return; }
  err.textContent = '';

  const names = raw.map(p => p.name.toLowerCase());
  if (new Set(names).size !== names.length) { err.textContent = 'Aynı isimde oyuncular var, lütfen ayırt edici isimler girin.'; return; }

  // Arayüzü ve Sekme Başlığını Güncelle
  document.title = gameName + " - ZEKAS"; 
  document.getElementById('display-game-name').textContent = gameName;
  document.getElementById('display-chief-ref').textContent = chiefRef;
  document.getElementById('display-refs').textContent = refs;

  raw.sort((a, b) => b.rating - a.rating);
  players = raw.map((p, i) => ({
    id: i + 1,
    name: p.name,
    rating: p.rating,
    score: 0,
    colorDiff: 0,
    lastColor: null,
    colorHistory: [],
    opponents: new Set(),
    results: {},
    byeRounds: 0,
  }));

  // BAŞ HAKEMİN GİRDİĞİ TUR SAYISINI KONTROL ET
  const manualRounds = parseInt(document.getElementById('setup-manual-rounds').value);
  const calculatedRounds = numRounds(players.length);
  const chosenRounds = (manualRounds > 0) ? manualRounds : calculatedRounds;

  // İsviçre Sistemi Üst Sınır Kontrolü (Kimse iki kez oynayamaz)
  if (chosenRounds > players.length - 1) {
    err.textContent = `HATA: ${players.length} oyuncu ile en fazla ${players.length - 1} tur oynatabilirsiniz. Lütfen tur sayısını düşürün veya boş bırakın.`;
    return;
  }

  totalRounds = chosenRounds;
  currentRound = 0;

  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('official-header').style.display = 'block';
  document.getElementById('info-players').textContent = players.length;
  document.getElementById('info-rounds').textContent = totalRounds;

  generateNextRound();
}

function numRounds(n) {
  return Math.ceil(Math.log2(n));
}

function doPairing(sorted) {
  const brackets = [];
  for (const p of sorted) {
    const last = brackets[brackets.length - 1];
    if (last && last[0].score === p.score) last.push(p);
    else brackets.push([p]);
  }

  const pairs = [];
  let downfloaters = [];

  for (let bi = 0; bi < brackets.length; bi++) {
    const bracket = [...downfloaters, ...brackets[bi]];
    downfloaters = [];
    const result = pairBracket(bracket, pairs);
    pairs.push(...result.pairs);
    downfloaters.push(...result.leftover);
  }

  if (downfloaters.length > 1) {
    const result = pairBracket(downfloaters, pairs);
    pairs.push(...result.pairs);
    downfloaters = result.leftover;
  }
  return { pairs, leftover: downfloaters };
}

function generatePairings() {
  const sorted = [...players].sort((a, b) => b.score - a.score || b.rating - a.rating);

  if (players.length % 2 === 0) {
    const { pairs } = doPairing(sorted);
    return pairs.map(([a, b]) => assignColors(a, b));
  }

  const candidates = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].byeRounds === 0) candidates.push(sorted[i]);
  }
  if (candidates.length === 0) candidates.push(sorted[sorted.length - 1]);

  let byePlayer = candidates[0];
  let bestPairs = null;
  let fewestLeftover = Infinity;

  for (const candidate of candidates) {
    const unpaired = sorted.filter(p => p.id !== candidate.id);
    const { pairs, leftover } = doPairing(unpaired);
    if (leftover.length < fewestLeftover) {
      fewestLeftover = leftover.length;
      bestPairs = pairs;
      byePlayer = candidate;
      if (fewestLeftover === 0) break;
    }
  }

  const coloredPairings = bestPairs.map(([a, b]) => assignColors(a, b));
  coloredPairings.push({ white: byePlayer, black: null });
  return coloredPairings;
}

function pairBracket(players, alreadyPaired) {
  if (players.length === 0) return { pairs: [], leftover: [] };
  if (players.length === 1) return { pairs: [], leftover: [players[0]] };

  const n = players.length;
  const half = Math.floor(n / 2);
  const S1 = players.slice(0, half);
  const S2 = players.slice(half);

  const s2Perms = limitedPermutations(S2, 500);

  for (const s2 of s2Perms) {
    const pairs = [];
    const usedS1 = new Set();
    const usedS2 = new Set();
    let valid = true;

    for (let i = 0; i < S1.length; i++) {
      const a = S1[i];
      let paired = false;
      for (let j = 0; j < s2.length; j++) {
        if (usedS2.has(j)) continue;
        const b = s2[j];
        if (canPair(a, b)) {
          pairs.push([a, b]);
          usedS1.add(i);
          usedS2.add(j);
          paired = true;
          break;
        }
      }
      if (!paired) { valid = false; break; }
    }

    if (valid) {
      const leftover = s2.filter((_, j) => !usedS2.has(j));
      return { pairs, leftover };
    }
  }
  return greedyPair(players);
}

function canPair(a, b) {
  if (a.opponents.has(b.id)) return false;
  const aPref = absolutePref(a);
  const bPref = absolutePref(b);
  if (aPref && bPref && aPref === bPref) return false;
  return true;
}

function absolutePref(p) {
  if (p.colorHistory.length >= 2) {
    const last2 = p.colorHistory.slice(-2);
    if (last2[0] === 'W' && last2[1] === 'W') return 'B'; 
    if (last2[0] === 'B' && last2[1] === 'B') return 'W'; 
  }
  if (p.colorDiff <= -1) return 'W'; 
  if (p.colorDiff >= 1) return 'B';  
  return null;
}

function greedyPair(players) {
  const pairs = [];
  const used = new Set();
  for (let i = 0; i < players.length; i++) {
    if (used.has(i)) continue;
    for (let j = i + 1; j < players.length; j++) {
      if (used.has(j)) continue;
      if (canPair(players[i], players[j])) {
        pairs.push([players[i], players[j]]);
        used.add(i);
        used.add(j);
        break;
      }
    }
  }
  const leftover = players.filter((_, i) => !used.has(i));
  return { pairs, leftover };
}

function limitedPermutations(arr, maxCount) {
  const results = [arr.slice()];
  if (arr.length <= 1) return results;
  const a = arr.slice();
  const c = new Array(a.length).fill(0);
  let i = 0;
  while (i < a.length && results.length < maxCount) {
    if (c[i] < i) {
      if (i % 2 === 0) [a[0], a[i]] = [a[i], a[0]];
      else [a[c[i]], a[i]] = [a[i], a[c[i]]];
      results.push(a.slice());
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
  return results;
}

function assignColors(a, b) {
  const aPref = absolutePref(a);
  const bPref = absolutePref(b);

  if (aPref === 'W' && bPref !== 'W') return { white: a, black: b };
  if (aPref === 'B' && bPref !== 'B') return { white: b, black: a };
  if (bPref === 'W' && aPref !== 'W') return { white: b, black: a };
  if (bPref === 'B' && aPref !== 'B') return { white: a, black: b };

  const aStrong = a.colorDiff === -1 ? 'W' : a.colorDiff === 1 ? 'B' : null;
  const bStrong = b.colorDiff === -1 ? 'W' : b.colorDiff === 1 ? 'B' : null;

  if (aStrong === 'W' && bStrong !== 'W') return { white: a, black: b };
  if (aStrong === 'B' && bStrong !== 'B') return { white: b, black: a };
  if (bStrong === 'W' && aStrong !== 'W') return { white: b, black: a };
  if (bStrong === 'B' && aStrong !== 'B') return { white: a, black: b };

  if (a.lastColor === 'W') return { white: b, black: a };
  if (a.lastColor === 'B') return { white: a, black: b };
  if (b.lastColor === 'W') return { white: a, black: b };
  if (b.lastColor === 'B') return { white: b, black: a };

  return a.rating >= b.rating ? { white: a, black: b } : { white: b, black: a };
}

function generateNextRound() {
  currentRound++;
  document.getElementById('info-current').textContent = currentRound;
  document.getElementById('round-title').textContent = `⚔️ ${currentRound}. Tur Eşleşmeleri`;
  document.getElementById('round-badge').textContent = `Tur ${currentRound} / ${totalRounds}`;

  currentPairings = generatePairings();
  renderPairings();
  updateNextBtn();

  const lateJoinCard = document.getElementById('late-join-card');
  if (lateJoinCard) {
    lateJoinCard.style.display = currentRound === 1 ? 'block' : 'none';
  }

  if (currentRound > 1) {
    document.getElementById('tables-area').style.display = 'grid';
    renderStandings();
    renderCrossTable();
  }
}

function toggleLateJoin() {
  const body = document.getElementById('late-join-body');
  const btn = document.getElementById('late-join-toggle');
  const expanded = body.style.display !== 'none';
  body.style.display = expanded ? 'none' : 'block';
}

function addLatePlayer() {
  const nameInput = document.getElementById('late-name');
  const ratingInput = document.getElementById('late-rating');
  const err = document.getElementById('late-error');

  const name = nameInput.value.trim();
  const rating = parseInt(ratingInput.value) || 0;

  if (!name) { err.textContent = 'Lütfen bir isim girin.'; return; }
  if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    err.textContent = 'Bu isimde biri zaten var, lütfen ayırıcı bir işaret koyun.';
    return;
  }
  err.textContent = '';

  const newId = Math.max(...players.map(p => p.id)) + 1;
  const newPlayer = {
    id: newId, name, rating, score: 0, colorDiff: 0, lastColor: null,
    colorHistory: [], opponents: new Set(), results: {}, byeRounds: 0,
  };

  players.push(newPlayer);
  
  // Geç kayıt sonrası tur sayısı hesabı ve manuel sınır kontrolü
  const manualRounds = parseInt(document.getElementById('setup-manual-rounds').value);
  const calculatedRounds = numRounds(players.length);
  const chosenRounds = (manualRounds > 0) ? manualRounds : calculatedRounds;

  if (chosenRounds > totalRounds && chosenRounds <= players.length - 1) {
    totalRounds = chosenRounds;
    document.getElementById('info-rounds').textContent = totalRounds;
  }

  document.getElementById('info-players').textContent = players.length;

  currentPairings.push({ white: newPlayer, black: null });
  renderPairings();
  updateNextBtn();
  nameInput.value = ''; ratingInput.value = ''; nameInput.focus();
}

function renderPairings() {
  const tbody = document.getElementById('pairings-body');
  tbody.innerHTML = '';

  currentPairings.forEach((pair, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;

    if (pair.black === null) {
      tr.innerHTML = `
        <td class="board-num">${idx + 1}</td>
        <td colspan="2"><span class="player-name">${esc(pair.white.name)}</span>
          <span class="rating-tag">(${pair.white.rating})</span></td>
        <td><span class="bye-result print-result-space">🌟 BAY (Eşleşmedi)</span></td>
      `;
    } else {
      tr.innerHTML = `
        <td class="board-num">${idx + 1}</td>
        <td>
          <span class="color-w"></span>
          <span class="player-name">${esc(pair.white.name)}</span>
          <span class="rating-tag">(${pair.white.rating})</span>
        </td>
        <td>
          <span class="color-b"></span>
          <span class="player-name">${esc(pair.black.name)}</span>
          <span class="rating-tag">(${pair.black.rating})</span>
        </td>
        <td class="print-result-space">
          <div class="result-btns">
            <button class="result-btn white-wins" onclick="setResult(${idx},'1-0',this)">1. Kazandı</button>
            <button class="result-btn draw" onclick="setResult(${idx},'½-½',this)">Berabere</button>
            <button class="result-btn black-wins" onclick="setResult(${idx},'0-1',this)">2. Kazandı</button>
          </div>
        </td>
      `;
    }
    tbody.appendChild(tr);
  });
}

function setResult(idx, result, btn) {
  currentPairings[idx].result = result;
  const row = document.querySelector(`tr[data-idx="${idx}"]`);
  row.querySelectorAll('.result-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateNextBtn();
}

function updateNextBtn() {
  const allSet = currentPairings.every(p => p.black === null || p.result !== undefined);
  const btn = document.getElementById('next-round-btn');
  btn.disabled = !allSet;
  btn.textContent = currentRound === totalRounds ? '🏁 Turnuvayı Bitir' : '✅ Sonuçları Kaydet & Sonraki Tur';
}

function submitRound() {
  const err = document.getElementById('result-error');
  const missing = currentPairings.filter(p => p.black !== null && !p.result);
  if (missing.length) { err.textContent = 'Lütfen tüm masaların maç sonucunu işaretleyin.'; return; }
  err.textContent = '';

  const confirmMsg = currentRound >= totalRounds
    ? 'Tüm maçlar bitti! Turnuvayı sonlandırıp nihai sıralamayı görmek istiyor musunuz?'
    : `${currentRound}. Tur maçlarını tamamlayıp ${currentRound + 1}. Tura geçmek üzeresiniz. Onaylıyor musunuz? (Bu işlem geri alınamaz)`;
  if (!confirm(confirmMsg)) return;

  const roundRecord = [];

  currentPairings.forEach(pair => {
    if (pair.black === null) {
      pair.white.score += 1;
      pair.white.byeRounds++;
      pair.white.colorHistory.push(null);
      roundRecord.push({ white: pair.white.id, black: null, result: 'bye' });
    } else {
      const w = pair.white;
      const b = pair.black;
      w.opponents.add(b.id);
      b.opponents.add(w.id);
      w.colorHistory.push('W');
      b.colorHistory.push('B');
      w.lastColor = 'W';
      b.lastColor = 'B';
      w.colorDiff++;
      b.colorDiff--;

      let wScore, bScore;
      if (pair.result === '1-0') { wScore = 1; bScore = 0; } 
      else if (pair.result === '0-1') { wScore = 0; bScore = 1; } 
      else { wScore = 0.5; bScore = 0.5; }

      w.score += wScore;
      b.score += bScore;
      w.results[b.id] = wScore;
      b.results[w.id] = bScore;
      roundRecord.push({ white: w.id, black: b.id, result: pair.result });
    }
  });

  rounds.push(roundRecord);

  if (currentRound >= totalRounds) {
    document.getElementById('round-card').style.display = 'none';
    document.getElementById('finished-banner').style.display = 'block';
    document.getElementById('tables-area').style.display = 'grid';
    renderStandings();
    renderCrossTable();
  } else {
    generateNextRound();
  }
}

function buchholz(player) {
  let sum = 0;
  player.opponents.forEach(oppId => {
    sum += players.find(p => p.id === oppId).score;
  });
  return sum;
}

function sonnenbornBerger(player) {
  let sb = 0;
  for (const [oppIdStr, result] of Object.entries(player.results)) {
    const oppId = parseInt(oppIdStr);
    const opp = players.find(p => p.id === oppId);
    sb += result * opp.score;
  }
  return sb;
}

function sortedStandings() {
  return [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const bh = buchholz(b) - buchholz(a);
    if (bh !== 0) return bh;
    return sonnenbornBerger(b) - sonnenbornBerger(a);
  });
}

function renderStandings() {
  const tbody = document.getElementById('standings-body');
  tbody.innerHTML = '';
  const standing = sortedStandings();
  standing.forEach((p, i) => {
    const bh = buchholz(p).toFixed(1);
    const sb = sonnenbornBerger(p).toFixed(2);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="rank-col">${i + 1}</td>
      <td class="player-name">${esc(p.name)} <span class="rating-tag">(${p.rating})</span></td>
      <td class="score-col">${formatScore(p.score)}</td>
      <td class="tiebreak-col">${bh}</td>
      <td class="tiebreak-col">${sb}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderCrossTable() {
  const wrap = document.getElementById('cross-table-wrap');
  const standing = sortedStandings();
  const n = standing.length;

  let html = '<table class="cross-table"><thead><tr>';
  html += '<th>#</th><th>Oyuncu</th>';
  for (let i = 1; i <= n; i++) html += `<th>${i}</th>`;
  html += '<th>Puan</th></tr></thead><tbody>';

  standing.forEach((p, ri) => {
    html += `<tr>
      <td>${ri + 1}</td>
      <td class="name-cell">${esc(p.name)}</td>`;

    standing.forEach((opp, ci) => {
      if (p.id === opp.id) {
        html += `<td class="self-cell">—</td>`;
      } else if (p.results.hasOwnProperty(opp.id)) {
        const r = p.results[opp.id];
        if (r === 1) html += `<td class="res-w">1</td>`;
        else if (r === 0) html += `<td class="res-l">0</td>`;
        else html += `<td class="res-d">½</td>`;
      } else {
        html += `<td>·</td>`;
      }
    });
    html += `<td><strong>${formatScore(p.score)}</strong></td></tr>`;
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function formatScore(s) {
  if (s % 1 === 0) return s.toString();
  return Math.floor(s) + '½';
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
