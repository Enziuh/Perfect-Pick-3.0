(() => {
  const cfg = window.PERFECT_PICK_3 || {};
  const api = String(cfg.apiUrl || '').replace(/\/+$/, '');
  let activeWeek = null;
  let prizeData = null;
  const weekCache = new Map();

  const $ = (id) => document.getElementById(id);
  const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
  };
  const money = (n) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD'
  }).format(Number(n || 0));

  async function get(action, extra = '') {
    if (!api) throw new Error('API URL has not been configured yet.');
    const url = `${api}?action=${encodeURIComponent(action)}${extra}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`API request failed (${res.status})`);
    return res.json();
  }

  function setStatus(text, type = '') {
    const el = $('status');
    if (!el) return;
    el.textContent = text;
    el.className = `status ${type}`.trim();
  }

  function renderDashboard(prizes) {
    setText('activeWeek', prizes.activeWeek || '—');
    const periodLabel = prizes.currentPeriodName || prizes.currentPeriod || '—';
    setText('periodName', periodLabel);
    setText('weeklyPot', money(prizes.currentWeeklyPot));
    setText('monthlyPot', money(prizes.currentMonthlyPot));
    setText('monthlyWinnerPool', money(prizes.projectedMonthlyWinnerPool));
    setText('seasonPot', money(prizes.projectedSeasonPot));
    setText(
      'confirmedSeasonPot',
      `Confirmed after completed periods: ${money(prizes.confirmedSeasonPot)}`
    );

    const rolloverLines = (prizes.currentMonthlyRolloverBreakdown || [])
      .map(x => `Week ${x.week}: ${money(x.amount)}`)
      .join(' + ');

    const monthlyBase = rolloverLines || 'No finalized weekly rollovers yet';
    const projectedSeasonContribution = Number(prizes.currentMonthlyPot || 0) * 0.50;
    $('prizeBreakdown').innerHTML = `
      <div class="breakdown-row">
        <span>Monthly rollover pot</span>
        <strong>${money(prizes.currentMonthlyPot)}</strong>
        <small>${escapeHtml(monthlyBase)}</small>
      </div>
      <div class="breakdown-arrow">→</div>
      <div class="breakdown-row">
        <span>Monthly prize portion</span>
        <strong>${money(prizes.projectedMonthlyWinnerPool)}</strong>
        <small>50% of the monthly rollover pot</small>
      </div>
      <div class="breakdown-arrow">+</div>
      <div class="breakdown-row">
        <span>Season pot portion</span>
        <strong>${money(projectedSeasonContribution)}</strong>
        <small>50% of the monthly rollover pot</small>
      </div>
    `;

    const activeWeek = Number(prizes.activeWeek || 0);
    const recent = (prizes.weekly || [])
      .filter(w => w.activePlayers > 0 && w.week <= activeWeek)
      .sort((a, b) => b.week - a.week)
      .slice(0, 5);

    $('recentWeeks').innerHTML = recent.map(w => `
      <tr>
        <td>W${w.week}</td>
        <td>${money(w.weeklyPot)}</td>
        <td>${w.finalized ? 'Final' : 'Pending'}</td>
        <td>${w.perfectPickWinnerNames.length
          ? escapeHtml(w.perfectPickWinnerNames.join(', '))
          : (w.finalized ? 'Rollover' : '—')}</td>
      </tr>
    `).join('') || '<tr><td colspan="4">No weekly data yet.</td></tr>';
  }

  function renderStandings(prizes) {
    renderMonthlyPeriod(prizes.currentPeriod);

    const seasonBody = $('seasonStandingsBody');
    if (seasonBody) {
      seasonBody.innerHTML = (prizes.overallStandings || []).map(p => {
        const rankClass = p.rank === 1 ? 'rank-first' : p.rank === 2 ? 'rank-second' : p.rank === 3 ? 'rank-third' : '';
        return `
          <tr class="${rankClass}">
            <td><span class="rank-badge">${p.rank}</span></td>
            <td class="player-name-cell">${escapeHtml(p.name)}</td>
            <td class="num"><strong>${p.points}</strong></td>
            <td class="num">${p.completedGames}</td>
          </tr>
        `;
      }).join('') || '<tr><td colspan="4">No season standings yet.</td></tr>';
    }
  }

  function renderMonthlyPeriod(periodKey) {
    if (!prizeData) return;
    const period = (prizeData.periods || []).find(p => p.periodKey === periodKey);
    if (!period) return;

    setText('monthlyTitle', period.displayName || period.periodKey || 'Monthly Standings');

    const monthlyPrizeCallout = $('monthlyPrizeCallout');
    if (monthlyPrizeCallout) {
      const prizeAmount = money(period.monthlyWinnerPool || 0);
      const leaders = period.leaders || [];
      const tiebreak = period.tiebreakRule || {};
      const questionLabel = tiebreak.questionLabel || `WK ${period.endWeek} Tie Breaker — Final Game — Enter Combined Score`;

      const leaderLabel = leaders.length === 1
        ? `${escapeHtml(leaders[0])} is currently in 1st place`
        : leaders.length > 1
          ? `${leaders.map(escapeHtml).join(', ')} are currently tied for 1st place`
          : 'No current leader yet';

      const tieMessage = leaders.length > 1
        ? `If the period ended tied, the tied 1st-place players would need to answer: <strong>${escapeHtml(questionLabel)}</strong>. Closest combined-points prediction wins the monthly prize.`
        : `If the period ends with multiple players tied for 1st, only the tied players will need to answer: <strong>${escapeHtml(questionLabel)}</strong>.`;

      monthlyPrizeCallout.innerHTML = `
        <span class="monthly-prize-label">Current 1st Place Prize</span>
        <strong>${prizeAmount}</strong>
        <small>${leaderLabel}</small>
        <div class="monthly-tiebreak-note">${tieMessage}</div>
      `;
    }

    const body = $('monthlyStandingsBody');
    if (body) {
      body.innerHTML = (period.standings || []).map(p => {
        const rankClass = p.rank === 1 ? 'rank-first' : p.rank === 2 ? 'rank-second' : p.rank === 3 ? 'rank-third' : '';
        return `
          <tr class="${rankClass}">
            <td><span class="rank-badge">${p.rank}</span></td>
            <td class="player-name-cell">${escapeHtml(p.name)}</td>
            <td class="num"><strong>${p.points}</strong></td>
          </tr>
        `;
      }).join('') || '<tr><td colspan="3">No standings for this period yet.</td></tr>';
    }
  }

  function renderPrizes(prizes) {
    $('periodCards').innerHTML = (prizes.periods || []).map(p => `
      <article class="period-card">
        <div class="period-head">
          <div>
            <div class="eyebrow">${escapeHtml(p.periodKey)}</div>
            <h3>${escapeHtml(p.displayName)}</h3>
          </div>
          <div class="rule-choice-group" aria-label="Rule mode">
            <span class="rule-choice ${p.ruleMode === 'OLD' ? 'active old-active' : ''}">OLD</span>
            <span class="rule-choice ${p.ruleMode === 'NEW' ? 'active new-active' : ''}">NEW</span>
          </div>
        </div>
        <div class="period-grid">
          <div><span>Weeks</span><strong>${p.startWeek}–${p.endWeek}</strong></div>
          <div><span>Monthly Pot</span><strong>${money(p.monthlyPot)}</strong></div>
          <div><span>Monthly 1st Place Pool (50%)</span><strong>${money(p.monthlyWinnerPool)}</strong></div>
          <div><span>Season Contribution (50%)</span><strong>${money(p.seasonContribution)}</strong></div>
        </div>
        <p class="muted">
          ${p.leaders.length
            ? `Current leader${p.leaders.length > 1 ? 's' : ''}: ${escapeHtml(p.leaders.join(', '))}`
            : 'No leader data yet.'}
        </p>
      </article>
    `).join('');

    $('weeklyPrizeBody').innerHTML = (prizes.weekly || []).map(w => `
      <tr>
        <td>${w.week}</td>
        <td>${escapeHtml(w.periodKey)}</td>
        <td class="num">${w.activePlayers}</td>
        <td class="num">${money(w.weeklyPot)}</td>
        <td>${w.finalized ? 'Yes' : 'No'}</td>
        <td>${w.perfectPickWinnerNames.length ? escapeHtml(w.perfectPickWinnerNames.join(', ')) : '—'}</td>
        <td class="num">${money(w.rolloverToMonthly)}</td>
      </tr>
    `).join('');
  }


  async function loadWeekPicks(week) {
    const normalizedWeek = Number(week);
    if (!normalizedWeek) return;

    $('weekSelect').value = String(normalizedWeek);
    $('picksWeekTitle').textContent = `Week ${normalizedWeek} Picks`;
    $('picksSubmissionCount').textContent = 'Loading submissions…';
    $('pickPercentages').innerHTML = '<div class="muted">Loading pick percentages…</div>';
    $('playerPicksHead').innerHTML = '';
    $('playerPicksBody').innerHTML = '<tr><td>Loading player picks…</td></tr>';

    try {
      let data = weekCache.get(normalizedWeek);
      if (!data) {
        data = await get('week', `&week=${normalizedWeek}`);
        weekCache.set(normalizedWeek, data);
      }
      renderWeekPicks(data);
      if (Number($('weeklyWeekSelect')?.value || activeWeek) === normalizedWeek) {
        renderWeeklyDetails(data);
      }
      if (normalizedWeek === activeWeek) {
        renderDashboardGameResults(data);
      }
    } catch (err) {
      console.error(err);
      $('picksSubmissionCount').textContent = 'Could not load this week.';
      $('pickPercentages').innerHTML = `<div class="muted">${escapeHtml(err.message || 'Could not load pick percentages.')}</div>`;
      $('playerPicksBody').innerHTML = `<tr><td>${escapeHtml(err.message || 'Could not load player picks.')}</td></tr>`;
    }
  }

  function renderWeekPicks(data) {
    const standings = data.standings || [];
    const games = data.games || [];
    const results = data.results || [];

    $('picksSubmissionCount').textContent =
      `${standings.length} submission${standings.length === 1 ? '' : 's'} for Week ${data.week}`;

    renderPickPercentages(games, standings, results);
    renderPlayerPicksTable(games, standings, results);
  }

  function resultForGame_(game, results) {
    return (results || []).find(
      result => normalizeGameLabel(result.game) === normalizeGameLabel(game)
    ) || null;
  }

  function scoreDisplay_(value) {
    return value === '' || value === null || value === undefined ? '' : String(value);
  }

  function resultScoreText_(result) {
    if (!result) return '';
    const score1 = scoreDisplay_(result.team1Score);
    const score2 = scoreDisplay_(result.team2Score);
    if (score1 === '' || score2 === '') return '';
    return `${score1}–${score2}`;
  }

  function renderPickPercentages(games, standings, results) {
    if (!games.length) {
      $('pickPercentages').innerHTML = '<div class="muted">No games found for this week.</div>';
      return;
    }

    const cards = games.map(game => {
      const votes = new Map();
      let total = 0;

      standings.forEach(player => {
        const pickObj = (player.picks || []).find(
          p => normalizeGameLabel(p.game) === normalizeGameLabel(game)
        );
        const pick = String(pickObj?.pick || '').trim();
        if (!pick) return;

        votes.set(pick, (votes.get(pick) || 0) + 1);
        total++;
      });

      const result = resultForGame_(game, results);
      const winner = String(result?.winner || '').trim();
      const status = String(result?.status || 'Pending').trim();
      const scoreText = resultScoreText_(result);

      const displayParts = [...votes.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([team, count]) => {
          const pct = total ? Math.round((count / total) * 100) : 0;
          const isFinal = status.toLowerCase() === 'final' && winner;
          const won = isFinal && normalizeTeamLabel(team) === normalizeTeamLabel(winner);
          const cls = won ? 'vote-option vote-winner' : 'vote-option vote-team';
          const style = teamColorStyle_(team);

          return `
            <span class="${cls}" style="${style}">
              ${teamBadgeHtml_(team, true, 'vote-team-badge')}
              <span>${escapeHtml(team)}</span>
              <strong>${pct}%</strong>
              ${won ? '<span class="vote-check">✓</span>' : ''}
            </span>
          `;
        });

      const winnerLine = winner
        ? `
          <div class="pick-winner-line" style="${teamColorStyle_(winner)}">
            ${teamBadgeHtml_(winner, true, 'winner-team-badge')}
            <span>Winner: <strong>${escapeHtml(winner)}</strong>${scoreText ? ` • ${escapeHtml(scoreText)}` : ''}</span>
          </div>
        `
        : '';

      return `
        <article class="pick-percent-card">
          <div class="pick-game">${matchupHeaderHtml_(game)}</div>
          <div class="pick-split">
            ${displayParts.length
              ? displayParts.join('')
              : '<span class="muted">No picks yet</span>'}
          </div>
          ${winnerLine}
          <div class="pick-meta">
            ${escapeHtml(status)} • ${total} vote${total === 1 ? '' : 's'}
          </div>
        </article>
      `;
    });

    $('pickPercentages').innerHTML = cards.join('');
  }

  function renderPlayerPicksTable(games, standings, results) {
    const head = `
      <tr>
        <th>Player</th>
        ${games.map(game => `<th class="game-th">${matchupHeaderHtml_(game)}</th>`).join('')}
      </tr>
    `;

    const body = standings.map(player => {
      const cells = games.map(game => {
        const pick = (player.picks || []).find(
          p => normalizeGameLabel(p.game) === normalizeGameLabel(game)
        );
        const result = resultForGame_(game, results);

        if (!pick || !pick.pick) {
          return '<td class="pick-cell empty">—</td>';
        }

        const cls = pick.correct === true
          ? 'correct'
          : pick.correct === false
            ? 'wrong'
            : 'pending';

        const marker = pick.correct === true
          ? '✓'
          : pick.correct === false
            ? '✕'
            : '';

        const pickedTeam = String(pick.pick || '').trim();
        const winner = String(result?.winner || pick.winner || '').trim();
        const scoreText = resultScoreText_(result);

        const winnerDetail = winner
          ? `
            <span class="pick-outcome-winner" style="${teamColorStyle_(winner)}">
              ${teamBadgeHtml_(winner, true, 'pick-winner-badge')}
              <span>Winner: ${escapeHtml(winner)}${scoreText ? ` ${escapeHtml(scoreText)}` : ''}</span>
            </span>
          `
          : '<span class="pick-outcome-pending">Waiting for result</span>';

        return `
          <td class="pick-cell ${cls}" style="${teamColorStyle_(pickedTeam)}">
            <div class="pick-cell-content">
              <div class="pick-team-line">
                ${teamBadgeHtml_(pickedTeam, true, 'pick-team-badge')}
                <strong>${escapeHtml(pickedTeam)}</strong>
                ${marker ? `<span class="pick-mark">${marker}</span>` : ''}
              </div>
              <div class="pick-outcome">
                ${winnerDetail}
              </div>
            </div>
          </td>
        `;
      }).join('');

      return `<tr><td class="player-name">${escapeHtml(player.name)}</td>${cells}</tr>`;
    }).join('');

    $('playerPicksHead').innerHTML = head;
    $('playerPicksBody').innerHTML = body || `<tr><td colspan="${games.length + 1}">No submissions yet.</td></tr>`;
  }

  function populateWeekSelector(weeks, defaultWeek) {
    const select = $('weekSelect');
    select.innerHTML = weeks.map(week =>
      `<option value="${week}">Week ${week}</option>`
    ).join('');

    select.value = String(defaultWeek);
    select.addEventListener('change', () => loadWeekPicks(select.value));
  }

  function normalizeGameLabel(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function shortGameLabel(value) {
    return String(value || '').replace(/\s+vs\.?\s+/i, ' vs ');
  }


  function renderWeeklyDetails(weekData) {
    setText('weeklyTitle', `Week ${weekData?.week || '—'} Standings`);
    setText(
      'weeklyStatusNote',
      weekData?.outcome?.finalized ? 'This week is final.' : 'Live standings for this week.'
    );
    setText('weeklyResultsWeek', `Week ${weekData?.week || '—'}`);

    const standingsBody = $('weeklyStandingsBody');
    if (standingsBody) {
      standingsBody.innerHTML = (weekData?.standings || []).map(p => {
        const rankClass = p.rank === 1 ? 'rank-first' : p.rank === 2 ? 'rank-second' : p.rank === 3 ? 'rank-third' : '';
        return `
        <tr class="${rankClass}">
          <td><span class="rank-badge">${p.rank}</span></td>
          <td class="player-name-cell">${escapeHtml(p.name)}</td>
          <td class="num"><strong>${p.points}</strong></td>
          <td class="num">${p.completedGames}</td>
        </tr>
      `;
      }).join('') || '<tr><td colspan="4">No submissions yet.</td></tr>';
    }

    renderGameResultsInto_('weeklyGameResults', weekData, false);
  }

  function renderDashboardGameResults(weekData) {
    setText('dashboardResultsWeek', `Week ${weekData?.week || '—'}`);
    renderGameResultsInto_('dashboardGameResults', weekData, true);
  }

  function renderGameResultsInto_(containerId, weekData, compact) {
    const container = $(containerId);
    if (!container) return;

    const standings = weekData?.standings || [];
    const games = weekData?.games || [];
    const results = weekData?.results || [];

    if (!games.length) {
      container.innerHTML = '<div class="muted">No games found for this week.</div>';
      return;
    }

    container.innerHTML = games.map(game => {
      const result = resultForGame_(game, results);

      // Backward compatibility while the updated Apps Script deployment rolls out.
      const pickRecords = standings.flatMap(p => p.picks || [])
        .filter(p => normalizeGameLabel(p.game) === normalizeGameLabel(game));
      const sample = pickRecords.find(p => p.status) || {};

      const winner = String(result?.winner ?? sample.winner ?? '').trim();
      const status = String(result?.status ?? sample.status ?? 'Pending').trim();

      const teams = String(game).split(/\s+vs\.?\s+/i);
      const team1 = String(result?.team1 || teams[0] || game).trim();
      const team2 = String(result?.team2 || teams[1] || '').trim();

      const score1 = scoreDisplay_(result?.team1Score ?? sample.team1Score);
      const score2 = scoreDisplay_(result?.team2Score ?? sample.team2Score);

      const t1Won = winner && normalizeTeamLabel(team1) === normalizeTeamLabel(winner);
      const t2Won = winner && normalizeTeamLabel(team2) === normalizeTeamLabel(winner);

      return `
        <article class="game-result-card ${compact ? 'compact-result-card' : ''}">
          <div class="game-result-status">${escapeHtml(status)}</div>
          ${teamResultHtml_(
            team1,
            score1,
            winner ? (t1Won ? 'winner' : 'loser') : 'pending'
          )}
          ${teamResultHtml_(
            team2,
            score2,
            winner ? (t2Won ? 'winner' : 'loser') : 'pending'
          )}
        </article>
      `;
    }).join('');
  }

  function teamResultHtml_(team, score, state) {
    const highlighted = state === 'winner';
    const style = highlighted ? teamColorStyle_(team) : '';
    const cls = highlighted ? 'team-winner' : 'team-neutral';
    const outcomeLabel = state === 'winner' ? 'WIN' : state === 'loser' ? 'LOSS' : '';
    const scoreHtml = score === ''
      ? '<span class="team-result-score empty-score">—</span>'
      : `<span class="team-result-score">${escapeHtml(score)}</span>`;

    return `
      <div class="team-result ${cls}" ${style ? `style="${style}"` : ''}>
        <span class="team-result-name">
          ${teamBadgeHtml_(team, highlighted, 'team-result-badge')}
          <span>${escapeHtml(team)}</span>
        </span>
        <span class="team-result-right">
          ${scoreHtml}
          ${outcomeLabel ? `<strong>${outcomeLabel}</strong>` : ''}
        </span>
      </div>
    `;
  }

  const NFL_TEAM_ABBRS = {
    cardinals:'ARI',
    falcons:'ATL',
    ravens:'BAL',
    bills:'BUF',
    panthers:'CAR',
    bears:'CHI',
    bengals:'CIN',
    browns:'CLE',
    cowboys:'DAL',
    broncos:'DEN',
    lions:'DET',
    packers:'GB',
    texans:'HOU',
    colts:'IND',
    jaguars:'JAX',
    chiefs:'KC',
    raiders:'LV',
    chargers:'LAC',
    rams:'LAR',
    dolphins:'MIA',
    vikings:'MIN',
    patriots:'NE',
    saints:'NO',
    giants:'NYG',
    jets:'NYJ',
    eagles:'PHI',
    steelers:'PIT',
    '49ers':'SF',
    seahawks:'SEA',
    buccaneers:'TB',
    titans:'TEN',
    commanders:'WAS'
  };

  function teamAbbr_(team) {
    return NFL_TEAM_ABBRS[normalizeTeamLabel(team)] || String(team || '').trim().slice(0, 3).toUpperCase();
  }

  function teamBadgeHtml_(team, highlighted = false, className = 'team-badge') {
    const style = highlighted ? teamColorStyle_(team) : '';
    const cls = highlighted ? `${className} highlighted` : className;
    return `<span class="${cls}" ${style ? `style="${style}"` : ''}>${escapeHtml(teamAbbr_(team))}</span>`;
  }

  function matchupHeaderHtml_(game) {
    const teams = String(game || '').split(/\s+vs\.?\s+/i);
    const team1 = teams[0] || game;
    const team2 = teams[1] || '';
    if (!team2) return escapeHtml(game);

    return `
      <div class="matchup-header">
        <span class="matchup-team">${teamBadgeHtml_(team1, false, 'matchup-badge')}<span>${escapeHtml(team1)}</span></span>
        <span class="matchup-vs">vs</span>
        <span class="matchup-team">${teamBadgeHtml_(team2, false, 'matchup-badge')}<span>${escapeHtml(team2)}</span></span>
      </div>
    `;
  }

  const NFL_TEAM_COLORS = {
    cardinals:'#97233F', falcons:'#A71930', ravens:'#241773', bills:'#00338D',
    panthers:'#0085CA', bears:'#0B162A', bengals:'#FB4F14', browns:'#311D00',
    cowboys:'#003594', broncos:'#FB4F14', lions:'#0076B6', packers:'#203731',
    texans:'#03202F', colts:'#002C5F', jaguars:'#006778', chiefs:'#E31837',
    raiders:'#000000', chargers:'#0080C6', rams:'#003594', dolphins:'#008E97',
    vikings:'#4F2683', patriots:'#002244', saints:'#D3BC8D', giants:'#0B2265',
    jets:'#125740', eagles:'#004C54', steelers:'#FFB612', '49ers':'#AA0000',
    seahawks:'#002244', buccaneers:'#D50A0A', titans:'#4B92DB', commanders:'#5A1414'
  };

  function teamColor_(team) {
    return NFL_TEAM_COLORS[normalizeTeamLabel(team)] || '#147a5f';
  }

  function teamColorStyle_(team) {
    return `--team-color:${teamColor_(team)};`;
  }

  function normalizeTeamLabel(value) {
    return String(value || '').trim().toLowerCase().split(/\s+/).pop();
  }

  function populateWeeklySelector(weeks, defaultWeek) {
    const select = $('weeklyWeekSelect');
    if (!select) return;

    select.innerHTML = weeks.map(week =>
      `<option value="${week}">Week ${week}</option>`
    ).join('');
    select.value = String(defaultWeek);

    select.addEventListener('change', async () => {
      const week = Number(select.value);
      let data = weekCache.get(week);
      if (!data) {
        data = await get('week', `&week=${week}`);
        weekCache.set(week, data);
      }
      renderWeeklyDetails(data);
    });
  }

  function populateMonthlySelector(periods, defaultPeriod) {
    const select = $('monthlyPeriodSelect');
    if (!select) return;

    select.innerHTML = periods.map(period =>
      `<option value="${escapeHtml(period.periodKey)}">${escapeHtml(period.displayName)} (${period.startWeek}-${period.endWeek})</option>`
    ).join('');
    select.value = defaultPeriod || periods[0]?.periodKey || '';

    select.addEventListener('change', () => renderMonthlyPeriod(select.value));
  }

  function setupTabs() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-tab]').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        $(btn.dataset.tab).classList.add('active');
      });
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function load() {
    setupTabs();

    if (!api) {
      setStatus('Add your Apps Script Web App URL to config-3.0.js.', 'warn');
      return;
    }

    try {
      setStatus('Loading Perfect Pick 3.0…');
      const prizes = await get('prizes');
      prizeData = prizes;
      renderDashboard(prizes);
      renderStandings(prizes);
      renderPrizes(prizes);

      activeWeek = Number(prizes.activeWeek || 1);
      const weeks = (prizes.weekly || []).map(w => Number(w.week)).filter(Boolean);
      const availableWeeks = weeks.length ? weeks : Array.from({ length: 18 }, (_, i) => i + 1);

      populateWeekSelector(availableWeeks, activeWeek);
      populateWeeklySelector(availableWeeks, activeWeek);
      populateMonthlySelector(prizes.periods || [], prizes.currentPeriod);

      await loadWeekPicks(activeWeek);

      const when = prizes.generatedAt ? new Date(prizes.generatedAt).toLocaleString() : '';
      setStatus(`Live data loaded${when ? ` • ${when}` : ''}`, 'ok');
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Could not load data.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();
