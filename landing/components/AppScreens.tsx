import { demoCampaigns, demoPayments, demoStreak, inr, type DemoCampaign } from "@/lib/demo";
import { StatusPill } from "./Devices";
import {
  IconCamera,
  IconCheck,
  IconClock,
  IconFlame,
  IconHome,
  IconMegaphone,
  IconUser,
  IconWallet,
} from "./Icons";
import s from "./AppScreens.module.css";

/* Rider app screens of the campaign marketplace, on the 280×612 phone canvas.
   Layout and labels follow the FlexRiders rider app; all values are demonstration data. */

type Tab = "home" | "campaigns" | "earnings" | "you";

function TabBar({ active }: { active: Tab }) {
  const tabs = [
    { k: "home", label: "Home", Icon: IconHome },
    { k: "campaigns", label: "Campaigns", Icon: IconMegaphone },
    { k: "earnings", label: "Earnings", Icon: IconWallet },
    { k: "you", label: "You", Icon: IconUser },
  ] as const;
  return (
    <div className={s.tabbar}>
      {tabs.map(({ k, label, Icon }) => (
        <span key={k} className={k === active ? s.tabOn : undefined}>
          <Icon size={18} strokeWidth={k === active ? 2 : 1.6} />
          {label}
        </span>
      ))}
    </div>
  );
}

export function CampaignCard({ c, compact }: { c: DemoCampaign; compact?: boolean }) {
  const soon = c.filter === "soon";
  return (
    <div className={`${s.cCard} ${soon ? s.cSoon : ""}`}>
      <span className="brand-mono" style={{ width: 34, height: 34, fontSize: 14 }}>
        {c.k}
      </span>
      <div className={s.cBody}>
        <div className={s.cHead}>
          <b>{c.name}</b>
          <em className={soon ? s.badgeSoon : s.badgeOpen}>{soon ? "Opening Soon" : "Open"}</em>
        </div>
        <p className={s.cMeta}>
          {c.brand} · {c.distance} · {c.slots} slots
        </p>
        {!compact && (
          <p className={s.cFoot}>
            <span className="num">{inr(c.rate)}/day</span>
            <span>{soon && c.opensIn ? `Starts in ${c.opensIn}` : c.vehicles}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** Campaigns: map with the campaign's reach radius, the app's three filters, and nearby campaign cards.
 *  `animated` plays the reach sequence once: roads draw, the campaign pin drops, its radius grows step by
 *  step towards the maximum (as the backend expands it), then the cards arrive. */
export function DiscoverScreen({ animated = false }: { animated?: boolean }) {
  return (
    <div className={s.screen} data-animate={animated || undefined}>
      <p className={s.title}>Campaigns</p>
      <div className={s.chips}>
        <span className={s.chipOn}>Near You</span>
        <span>Opening Soon</span>
        <span>My Areas</span>
      </div>

      <div className={s.map} aria-hidden="true">
        <i className={s.road1} />
        <i className={s.road2} />
        <i className={s.road3} />
        <span className={s.ringMax} />
        <span className={s.ring} />
        <span className={s.pin}>A</span>
        <span className={`${s.pin} ${s.pinSoon}`}>B</span>
        <span className={s.me} />
        <span className={s.mapLabel}>Radius expands over time</span>
      </div>

      <div className={s.list}>
        {demoCampaigns.slice(0, 2).map((c) => (
          <CampaignCard key={c.name} c={c} />
        ))}
      </div>
      <TabBar active="campaigns" />
    </div>
  );
}

const slots = [
  { name: "Morning", window: "8 – 11 AM", state: "Approved" },
  { name: "Evening", window: "4 – 7 PM", state: "In review" },
  { name: "Night", window: "8 – 10 PM", state: "Upcoming" },
] as const;

/** Daily Activity: today's three photo sessions and the streak. */
export function PhotosScreen() {
  return (
    <div className={s.screen}>
      <p className={s.title}>Daily Activity</p>
      <p className={s.sub}>{demoCampaigns[0].name} · Day 7</p>

      <div className={s.slots}>
        {slots.map((sl) => (
          <div key={sl.name} className={s.slot} data-state={sl.state}>
            <span className={s.slotIcon}>
              {sl.state === "Approved" ? <IconCheck size={14} /> : sl.state === "In review" ? <IconClock size={15} /> : <IconCamera size={15} />}
            </span>
            <div>
              <b>{sl.name}</b>
              <em>{sl.window}</em>
            </div>
            <span className={s.slotState}>{sl.state}</span>
          </div>
        ))}
      </div>

      <div className={s.streak}>
        <span className={s.flame}>
          <IconFlame size={18} />
        </span>
        <div>
          <b>{demoStreak.current} Day Streak</b>
          <em>Longest {demoStreak.longest}</em>
        </div>
      </div>
      <div className={s.week} aria-hidden="true">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} data-on={i < 6 ? "true" : undefined}>
            {d}
          </span>
        ))}
      </div>
      <p className={s.rule}>
        All 3 photos approved on a day completes 1 streak day and earns {inr(demoStreak.rate)}.
      </p>
      <TabBar active="home" />
    </div>
  );
}

/** Earnings: earned total, UPI payout destination and payout history. */
export function EarningsScreen() {
  const total = demoPayments.reduce((n, p) => n + p.amount, 0);
  return (
    <div className={s.screen}>
      <p className={s.title}>Earnings</p>
      <div className={s.earn}>
        <p>Total earned</p>
        <b className="num">{inr(total)}</b>
        <div>
          <span>Approved days</span>
          <span className="num">{demoPayments.length}</span>
        </div>
      </div>
      <div className={s.upi}>
        <span>UPI ID</span>
        <b>rider@upi</b>
      </div>
      <p className={s.listLabel}>Payouts</p>
      <ul className={s.payouts}>
        {demoPayments.slice(0, 4).map((p) => (
          <li key={p.txn}>
            <div>
              <b>{p.date}</b>
              <em className="num">{p.txn}</em>
            </div>
            <div className={s.payRight}>
              <b className="num">{inr(p.amount)}</b>
              <StatusPill status={p.status} style={{ fontSize: 10 }} />
            </div>
          </li>
        ))}
      </ul>
      <TabBar active="earnings" />
    </div>
  );
}
