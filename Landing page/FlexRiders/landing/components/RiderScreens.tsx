import Image from "next/image";
import avatar from "@/public/images/rider-avatar.webp";
import { demoEarnings, demoPayments, demoRider, inr } from "@/lib/demo";
import { StatusPill } from "./Devices";
import {
  IconBell,
  IconCheck,
  IconDoc,
  IconHome,
  IconPin,
  IconUpload,
  IconUser,
  IconWallet,
} from "./Icons";
import s from "./RiderScreens.module.css";

/* Rider mobile app screens. Rendered on the 280×612 phone canvas. All data is demonstration data. */

function Avatar({ size = 36 }: { size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      <Image src={avatar} alt="" width={size} height={size} sizes={`${size * 2}px`} />
    </span>
  );
}

function TabBar({ active }: { active: "home" | "pay" | "profile" }) {
  const tabs = [
    { k: "home", label: "Home", Icon: IconHome },
    { k: "pay", label: "Payments", Icon: IconWallet },
    { k: "profile", label: "Profile", Icon: IconUser },
  ] as const;
  return (
    <div className={s.tabbar}>
      {tabs.map(({ k, label, Icon }) => (
        <span key={k} className={k === active ? s.tabOn : undefined}>
          <Icon size={19} strokeWidth={k === active ? 2 : 1.6} />
          {label}
        </span>
      ))}
      <i className={s.homeIndicator} />
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className={s.notice}>
      <span className={s.noticeIcon}>
        <IconBell size={14} strokeWidth={2} />
      </span>
      <div>
        <p className={s.noticeTitle}>
          {title} <span>now</span>
        </p>
        <p className={s.noticeBody}>{body}</p>
      </div>
    </div>
  );
}

export function HomeScreen() {
  return (
    <div className={s.screen}>
      <header className={s.top}>
        <div>
          <p className={s.hello}>Good morning</p>
          <p className={s.title}>Rahul</p>
        </div>
        <Avatar size={38} />
      </header>

      <div className={`${s.card} ${s.rowBetween}`}>
        <div>
          <p className={s.label}>Account status</p>
          <StatusPill status="ACTIVE" style={{ fontSize: 13, marginTop: 5 }} />
        </div>
        <div style={{ textAlign: "right" }}>
          <p className={s.label}>Rider ID</p>
          <p className={s.value}>{demoRider.id}</p>
        </div>
      </div>

      <div className={s.earn}>
        <p className={s.earnLabel}>Today&apos;s earnings</p>
        <p className={`${s.earnBig} num`}>{inr(demoEarnings.today)}</p>
        <div className={s.earnRow}>
          <span>This month</span>
          <b className="num">{inr(demoEarnings.month)}</b>
        </div>
      </div>

      <div className={`${s.card} ${s.brandRow}`}>
        <span className="brand-mono" style={{ width: 38, height: 38, fontSize: 16 }}>
          A
        </span>
        <div style={{ flex: 1 }}>
          <p className={s.value}>{demoRider.brand}</p>
          <p className={s.sub}>
            {demoRider.city} · {demoRider.zone}
          </p>
        </div>
        <span className={s.tag}>Assigned</span>
      </div>

      <div className={`${s.card} ${s.rowBetween}`}>
        <div>
          <p className={s.value}>Payment · 23 Sep</p>
          <p className={s.sub}>{demoEarnings.txn}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p className={`${s.value} num`}>{inr(920)}</p>
          <StatusPill status="PAID" style={{ fontSize: 11 }} />
        </div>
      </div>

      <TabBar active="home" />
    </div>
  );
}

export function RegisterScreen() {
  const fields = [
    ["Full name", demoRider.name],
    ["Mobile number", demoRider.phone],
    ["City", demoRider.city],
    ["Vehicle", demoRider.vehicle],
  ];
  return (
    <div className={s.screen}>
      <p className={s.step}>Step 3 of 4</p>
      <p className={s.title}>Create your profile</p>
      <div className={s.progress}>
        <i style={{ width: "75%" }} />
      </div>

      <div className={s.form}>
        {fields.map(([k, v]) => (
          <div key={k} className={s.input}>
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>

      <p className={s.section}>Documents</p>
      <div className={s.docs}>
        {["Driving licence", "ID proof"].map((d) => (
          <div key={d} className={s.doc}>
            <IconDoc size={16} />
            <span>{d}</span>
            <em>
              <IconCheck size={11} /> Uploaded
            </em>
          </div>
        ))}
        <div className={`${s.doc} ${s.docAdd}`}>
          <IconUpload size={16} />
          <span>Vehicle RC</span>
          <em>Add</em>
        </div>
      </div>

      <div className={s.primaryBtn}>Submit for review</div>
    </div>
  );
}

export function ApprovedScreen() {
  const steps = [
    ["Registered", "10 Mar"],
    ["Under review", "11 Mar"],
    ["Approved", "12 Mar"],
  ];
  return (
    <div className={`${s.screen} ${s.center}`}>
      <div className={s.bigCheck}>
        <IconCheck size={40} />
      </div>
      <p className={s.titleLg}>You&apos;re approved</p>
      <p className={s.subCenter}>
        The operations team has reviewed your application. You&apos;ll be notified when a brand is
        assigned.
      </p>
      <div className={s.tl}>
        {steps.map(([k, d]) => (
          <div key={k} className={s.tlRow}>
            <span className={s.tlDot}>
              <IconCheck size={10} />
            </span>
            <span>{k}</span>
            <em>{d}</em>
          </div>
        ))}
      </div>
      <div className={`${s.card} ${s.rowBetween}`} style={{ width: "100%", marginTop: "auto" }}>
        <p className={s.label} style={{ margin: 0 }}>
          Account status
        </p>
        <StatusPill status="APPROVED" style={{ fontSize: 12 }} />
      </div>
    </div>
  );
}

export function BrandScreen() {
  return (
    <div className={s.screen}>
      <Notice title="Flex Riders" body={`You've been assigned to ${demoRider.brand}.`} />
      <p className={s.title} style={{ marginTop: 14 }}>
        Your assignment
      </p>
      <div className={s.assign}>
        <span className="brand-mono" style={{ width: 64, height: 64, fontSize: 28 }}>
          A
        </span>
        <p className={s.assignName}>{demoRider.brand}</p>
        <StatusPill status="ACTIVE" style={{ fontSize: 12 }} />
      </div>
      <div className={s.list}>
        <div>
          <IconPin size={16} />
          <span>Working location</span>
          <b>
            {demoRider.city}, {demoRider.zone}
          </b>
        </div>
        <div>
          <IconCheck size={16} />
          <span>Assigned since</span>
          <b>{demoRider.since}</b>
        </div>
        <div>
          <IconUser size={16} />
          <span>Rider ID</span>
          <b>{demoRider.id}</b>
        </div>
      </div>
      <TabBar active="home" />
    </div>
  );
}

export function PaymentScreen() {
  return (
    <div className={s.screen}>
      <Notice title="Payment update" body="₹920 for 23 Sep has been marked as paid." />
      <p className={s.title} style={{ marginTop: 14 }}>
        Earnings
      </p>
      <div className={s.split}>
        <div className={s.card}>
          <p className={s.label}>Today</p>
          <p className={`${s.stat} num`}>{inr(demoEarnings.today)}</p>
        </div>
        <div className={s.card}>
          <p className={s.label}>This month</p>
          <p className={`${s.stat} num`}>{inr(demoEarnings.month)}</p>
        </div>
      </div>
      <div className={s.card}>
        <div className={s.rowBetween}>
          <p className={s.label} style={{ margin: 0 }}>
            Latest payment
          </p>
          <StatusPill status="PAID" style={{ fontSize: 11 }} />
        </div>
        <p className={`${s.statLg} num`}>{inr(920)}</p>
        <dl className={s.kv}>
          <div>
            <dt>Transaction ID</dt>
            <dd>{demoEarnings.txn}</dd>
          </div>
          <div>
            <dt>Brand</dt>
            <dd>{demoRider.brand}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>23 Sep 2026</dd>
          </div>
        </dl>
      </div>
      <TabBar active="pay" />
    </div>
  );
}

export function HistoryScreen() {
  return (
    <div className={s.screen}>
      <p className={s.title}>Payment history</p>
      <div className={s.filters}>
        <span className={s.filterOn}>September</span>
        <span>All brands</span>
      </div>
      <div className={s.history}>
        {demoPayments.map((p) => (
          <div key={p.txn} className={s.hRow}>
            <div>
              <p className={s.value}>{p.date}</p>
              <p className={s.sub}>{p.brand}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p className={`${s.value} num`}>{inr(p.amount)}</p>
              <StatusPill status={p.status} style={{ fontSize: 10 }} />
            </div>
          </div>
        ))}
      </div>
      <TabBar active="pay" />
    </div>
  );
}
