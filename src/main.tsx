import { render } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import './styles.css';
import games from '../assets/H2H.json';
import summaries from '../assets/SeasonSummary.json';

type Game = typeof games[number];
type Summary = typeof summaries[number];
type Tab = 'history' | 'team' | 'h2h' | 'trophy' | 'dynasty' | 'draft' | 'matchup';

const tabs: Array<[Tab, string]> = [
  ['history', 'History'], ['team', 'My Team'], ['h2h', 'Head to Head'], ['trophy', 'Trophy Case'],
  ['dynasty', 'Dynasty'], ['draft', 'Draft Spot'], ['matchup', 'Historical Matchup'],
];
const franchiseNames: Record<string, string> = {
  'franchise-01': 'Franchise 01', 'franchise-02': 'Franchise 02',
  'franchise-03': 'Franchise 03', 'franchise-04': 'Franchise 04',
};

function routeTab(): Tab {
  const value = new URLSearchParams(location.search).get('tab');
  return tabs.some(([id]) => id === value) ? value as Tab : 'history';
}

function label(key: string) { return franchiseNames[key] || key; }
function score(value: number) { return value.toFixed(2); }

function SummaryTable({ rows }: { rows: Summary[] }) {
  return <div class="table-wrap" tabIndex={0}><table><thead><tr><th>Season</th><th>Team / Franchise</th><th>W</th><th>L</th><th>T</th><th>Finish</th><th>Points for</th></tr></thead><tbody>
    {rows.map(row => <tr key={`${row.season}-${row.owner}`}><td>{row.season}</td><td>{label(row.owner)}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.ties}</td><td>{row.finish}</td><td>{score(row.points_for)}</td></tr>)}
  </tbody></table></div>;
}

function GameTable({ rows }: { rows: Game[] }) {
  return <div class="table-wrap" tabIndex={0}><table><thead><tr><th>Season</th><th>Week</th><th>Team / Franchise</th><th>Score</th><th>Opponent</th><th>Score</th></tr></thead><tbody>
    {rows.map((row, index) => <tr key={`${row.season}-${row.week}-${index}`}><td>{row.season}</td><td>{row.week}</td><td>{label(row.teamA)}</td><td>{score(row.scoreA)}</td><td>{label(row.teamB)}</td><td>{score(row.scoreB)}</td></tr>)}
  </tbody></table></div>;
}

function App() {
  const [tab, setTab] = useState<Tab>(routeTab);
  const [team, setTeam] = useState('franchise-01');
  const [season, setSeason] = useState('all');
  const selectedGames = useMemo(() => games.filter(game => (team === 'all' || game.teamA === team || game.teamB === team) && (season === 'all' || String(game.season) === season)), [team, season]);
  const selectedSummaries = useMemo(() => summaries.filter(row => (team === 'all' || row.owner === team) && (season === 'all' || String(row.season) === season)), [team, season]);
  const seasons = [...new Set(summaries.map(row => row.season))].sort();
  const selectTab = (next: Tab) => { setTab(next); history.replaceState(null, '', next === 'history' ? './' : `?tab=${next}`); };
  return <>
    <header class="hero"><div class="hero-image" style={{ backgroundImage: `linear-gradient(90deg,rgba(8,25,18,.78),rgba(8,25,18,.18)),url('${import.meta.env.BASE_URL}assets/hero/martini-source.png')` }}/><div class="hero-copy"><p class="eyebrow">A family league archive</p><h1>Martini Family Fantasy Football League</h1><p>Completed seasons, team records, and the matchups worth remembering.</p></div></header>
    <nav class="nav" aria-label="Primary"><div class="nav-inner">{tabs.map(([id, name]) => <button key={id} class={tab === id ? 'active' : ''} onClick={() => selectTab(id)}>{name}</button>)}</div></nav>
    <main class="content"><section class="intro"><div><p class="eyebrow">History first</p><h2>{tabs.find(([id]) => id === tab)?.[1]}</h2><p class="muted">Only completed seasons are shown. The 2026 season is intentionally not part of this archive.</p></div><div class="filters"><label>Team / Franchise<select value={team} onChange={event => setTeam((event.target as HTMLSelectElement).value)}><option value="all">All teams</option>{Object.keys(franchiseNames).map(key => <option value={key}>{label(key)}</option>)}</select></label><label>Season<select value={season} onChange={event => setSeason((event.target as HTMLSelectElement).value)}><option value="all">All completed seasons</option>{seasons.map(year => <option value={year}>{year}</option>)}</select></label></div></section>
      {tab === 'history' && <><div class="cards"><article><strong>{summaries.length}</strong><span>season records</span></article><article><strong>{games.length}</strong><span>archived matchups</span></article><article><strong>{seasons[0]}–{seasons.at(-1)}</strong><span>completed seasons</span></article></div><h3>Season standings</h3><SummaryTable rows={selectedSummaries}/></>}
      {tab === 'team' && <><h3>Team record history</h3><SummaryTable rows={selectedSummaries}/></>}
      {tab === 'h2h' && <><h3>Head-to-head archive</h3><GameTable rows={selectedGames}/></>}
      {tab === 'trophy' && <div class="empty"><h3>Trophy Case</h3><p>Championship labels will be promoted with the reviewed ESPN season export.</p></div>}
      {tab === 'dynasty' && <div class="empty"><h3>Dynasty</h3><p>Long-run franchise rankings are derived from the completed standings archive.</p><SummaryTable rows={selectedSummaries}/></div>}
      {tab === 'draft' && <div class="empty"><h3>Draft Spot</h3><p>Draft-order history will appear when the reviewed ESPN exports are promoted.</p></div>}
      {tab === 'matchup' && <><h3>Historical matchup</h3><GameTable rows={selectedGames.slice(0, 12)}/></>}
      <p class="source-note">Source status: the authenticated ESPN export is pending review; placeholder rows remain isolated to the candidate archive until promotion.</p>
    </main><footer>Martini Family Fantasy Football League · Public history archive</footer>
  </>;
}

render(<App />, document.getElementById('app')!);
