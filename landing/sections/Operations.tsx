"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, type ReactNode } from "react";
import avatar from "@/public/images/rider-avatar.webp";
import riderApproved from "@/public/images/rider-approved.webp";
import markDark from "@/public/images/fr-mark-dark.png";
import Logo from "@/components/Logo";
import { Browser, StatusPill } from "@/components/Devices";
import {
  IconBrand,
  IconChart,
  IconCheck,
  IconDoc,
  IconHistory,
  IconSearch,
  IconBell,
  IconUsers,
  IconWallet,
  IconShieldCheck,
  IconLock,
  IconPin,
} from "@/components/Icons";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { demoEarnings, demoPayments, demoRider, demoRiders, inr } from "@/lib/demo";
import s from "./Operations.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

const capabilities = [
  { Icon: IconShieldCheck, title: "Rider approvals", text: "Review applications and verify documentation with confidence." },
  { Icon: IconBrand, title: "Brand assignments", text: "Assign riders to brands and working locations seamlessly." },
  { Icon: IconWallet, title: "Payment management", text: "Record, track and settle every payout in real time." },
  { Icon: IconSearch, title: "Fast rider search", text: "Find any rider instantly by name, ID, phone or vehicle plate." },
  { Icon: IconDoc, title: "Protected documents", text: "Licences and vehicle RC securely stored with the profile." },
  { Icon: IconBell, title: "Automated alerts", text: "Keep riders and operations informed on status updates." },
  { Icon: IconChart, title: "Reports & analytics", text: "Live visibility into rider-days, fulfilment and earnings." },
  { Icon: IconHistory, title: "Complete audit log", text: "Immutable trail of every approval, assignment and payment." },
];

const availableNow = [
  "Rider Registration",
  "Application Approvals",
  "Brand Assignment",
  "Payment Tracking",
  "Document Verification",
  "Instant Notifications",
  "Operations Reports",
  "Audit History Trail",
];

const roadmap = [
  "Live GPS Tracking",
  "Automated Shifts",
  "WhatsApp Notifications",
  "Multi-City Operations",
  "Performance Incentives",
  "Automated UPI Payouts",
];

const approvalStages = [
  { status: "REGISTERED", text: "Rider submits mobile number, profile & vehicle details.", when: "Mon · 10:42" },
  { status: "PENDING REVIEW", text: "Operations team validates ID, licence and vehicle RC.", when: "Mon · 14:05" },
  { status: "APPROVED", text: "Verified and approved by an authorized team member.", when: "Tue · 09:30" },
  { status: "BRAND ASSIGNED", text: "Matched to a campaign brand and target working zone.", when: "Tue · 11:15" },
  { status: "ACTIVE", text: "Fleet member goes live on duty with instant app access.", when: "Tue · 11:16" },
];

const brandConnections = [
  { k: "A", name: "Brand A", meta: "Gurugram", on: true },
  { k: "B", name: "Brand B", meta: "Noida" },
  { k: "C", name: "Brand C", meta: "Delhi NCR" },
  { k: "D", name: "Brand D", meta: "Bengaluru" },
];

const assignmentHistory = [
  { brand: "Brand A", place: "Gurugram", range: "14 Mar 2026 — Present", current: true },
  { brand: "Brand C", place: "Gurugram", range: "02 Jan — 13 Mar 2026" },
  { brand: "Brand B", place: "Noida", range: "10 Oct 2025 — 01 Jan 2026" },
];

type WorkspaceTab = "riders" | "approvals" | "brands" | "profile" | "lifecycle";

export default function Operations() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("riders");

  return (
    <section id="operations" className={`section theme-light theme-paper ${s.ops}`} aria-labelledby="ops-title">
      <div className="container">
        {/* Section Header */}
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Operations &amp; Platform</p>
          </Reveal>
          <RevealHeading
            id="ops-title"
            className="display"
            lines={["One workspace.", <span key="b" className="blue-text">Complete operational control.</span>]}
          />
          <Reveal delay={0.12}>
            <p className="lead">
              A unified SaaS platform for operations teams to verify riders, coordinate brand assignments,
              and settle payments — with full history behind every action.
            </p>
          </Reveal>
        </div>

        {/* Tab Selector for Interactive Workspace */}
        <div className={s.tabSelectorWrap}>
          <div className={s.tabSelector} role="tablist" aria-label="Platform workspace views">
            {[
              { id: "riders", label: "Fleet & Riders", Icon: IconUsers },
              { id: "approvals", label: "Approvals Pipeline", Icon: IconShieldCheck },
              { id: "brands", label: "Brand Mapping", Icon: IconBrand },
              { id: "profile", label: "360° Rider Profile", Icon: IconDoc },
              { id: "lifecycle", label: "Connected Lifecycle", Icon: IconHistory },
            ].map(({ id, label, Icon }) => {
              const on = activeTab === id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={on}
                  className={`${s.tabBtn} ${on ? s.tabBtnActive : ""}`}
                  onClick={() => setActiveTab(id as WorkspaceTab)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  {on && <motion.div layoutId="opsActiveTab" className={s.tabIndicator} transition={{ duration: 0.3, ease }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive Workspace Browser */}
        <div className={s.perspective}>
          <Browser
            title={`Flex Riders Operations · ${
              activeTab === "riders"
                ? "Fleet Management"
                : activeTab === "approvals"
                ? "Approvals Pipeline"
                : activeTab === "brands"
                ? "Brand Assignments"
                : activeTab === "profile"
                ? "Rider Profile (360°)"
                : "Connected Lifecycle"
            }`}
            label="Flex Riders operations workspace showing interactive operational workflows"
          >
            <div className={s.workspaceContainer}>
              <AnimatePresence mode="wait">
                {activeTab === "riders" && <RidersWorkspaceView key="riders" />}
                {activeTab === "approvals" && <ApprovalsWorkspaceView key="approvals" />}
                {activeTab === "brands" && <BrandsWorkspaceView key="brands" />}
                {activeTab === "profile" && <ProfileWorkspaceView key="profile" />}
                {activeTab === "lifecycle" && <LifecycleWorkspaceView key="lifecycle" />}
              </AnimatePresence>
            </div>
          </Browser>
          <p className="demo-note">Interactive demonstration data</p>
        </div>

        {/* Platform Capabilities Grid */}
        <div className={s.capsWrap}>
          <div className={s.capsHeader}>
            <h3 className={s.capsSectionTitle}>Platform Capabilities</h3>
            <p className={s.capsSectionSub}>Everything your operations team needs to run at scale.</p>
          </div>
          <ul className={s.caps}>
            {capabilities.map(({ Icon, title, text }, i) => (
              <motion.li
                key={title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, ease, delay: (i % 4) * 0.06 }}
                className={s.capCard}
              >
                <span className={s.capIconWrap}>
                  <Icon size={20} className={s.capIcon} />
                </span>
                <div>
                  <h4 className={s.capTitle}>{title}</h4>
                  <p className={s.capText}>{text}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Scale & Roadmap Compact Banner */}
        <Reveal delay={0.15}>
          <div className={s.scaleBanner}>
            <div className={s.scaleLeft}>
              <div className={s.scaleMark}>
                <Logo height={24} wordmark={false} />
                <span>Flex Riders Core</span>
              </div>
              <h4 className={s.scaleTitle}>Built for today&apos;s operations. Ready for scale.</h4>
              <p className={s.scaleDesc}>
                Proven architecture handling high-concurrency fleet coordination, instant document verification, and multi-city operations.
              </p>
            </div>

            <div className={s.scaleRight}>
              <div className={s.scalePillGroup}>
                <span className={s.scaleGroupLabel}>
                  <i className={s.dotNow} /> Available Now
                </span>
                <div className={s.scalePills}>
                  {availableNow.map((item) => (
                    <span key={item} className={s.scalePillNow}>
                      <IconCheck size={12} /> {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className={s.scalePillGroup}>
                <span className={s.scaleGroupLabel}>
                  <i className={s.dotNext} /> On Roadmap
                </span>
                <div className={s.scalePills}>
                  {roadmap.map((item) => (
                    <span key={item} className={s.scalePillNext}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ==========================================================================
   WORKSPACE TABS IMPLEMENTATIONS
   ========================================================================== */

/* ---- Tab 1: Riders Fleet Management ---- */
function RidersWorkspaceView() {
  const [selectedRider, setSelectedRider] = useState(demoRiders[0]);
  const [filter, setFilter] = useState("All");

  const filtered = filter === "All" ? demoRiders : demoRiders.filter((r) => r.status === filter.toUpperCase());

  return (
    <motion.div
      className={s.ui}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease }}
    >
      <aside className={s.side}>
        <div className={s.sideBrand}>
          <Image src={markDark} alt="" width={24} height={12} />
          <span>Operations</span>
        </div>
        <div className={s.navOn}>
          <IconUsers size={15} />
          <span>Riders Fleet</span>
        </div>
        <div className={s.navItem}>
          <IconShieldCheck size={15} />
          <span>Approvals</span>
          <em>12</em>
        </div>
        <div className={s.navItem}>
          <IconBrand size={15} />
          <span>Brands</span>
        </div>
        <div className={s.navItem}>
          <IconWallet size={15} />
          <span>Payments</span>
        </div>
        <div className={s.navItem}>
          <IconDoc size={15} />
          <span>Documents</span>
        </div>
      </aside>

      <div className={s.main}>
        <div className={s.topbar}>
          <h4>Riders Management</h4>
          <div className={s.search}>
            <IconSearch size={14} />
            <span>Search by name, ID or phone…</span>
          </div>
        </div>

        <div className={s.tabs}>
          {["All", "Active", "Approved", "Registered"].map((t) => (
            <button
              key={t}
              type="button"
              className={filter === t ? s.tabOn : undefined}
              onClick={() => setFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className={s.table}>
          <div className={`${s.row} ${s.thead}`}>
            <span>Rider ID</span>
            <span>Name</span>
            <span className={s.colCity}>City</span>
            <span className={s.colBrand}>Brand</span>
            <span>Status</span>
          </div>
          {filtered.map((r) => (
            <div
              key={r.id}
              className={`${s.row} ${selectedRider.id === r.id ? s.rowOn : ""}`}
              onClick={() => setSelectedRider(r)}
              role="button"
              tabIndex={0}
            >
              <span className={s.mono}>{r.id}</span>
              <span className={s.name}>
                <b>{r.name}</b>
                <em>{r.id}</em>
              </span>
              <span className={s.colCity}>{r.city}</span>
              <span className={s.colBrand}>{r.brand || "—"}</span>
              <span>
                <StatusPill status={r.status} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <aside className={s.panel}>
        <div className={s.pHead}>
          <span className="avatar" style={{ width: 44, height: 44 }}>
            <Image src={avatar} alt="" width={44} height={44} sizes="88px" />
          </span>
          <div>
            <b>{selectedRider.name}</b>
            <em>{selectedRider.id}</em>
          </div>
        </div>
        <StatusPill status={selectedRider.status} className={s.pPill} />
        <dl className={s.pKv}>
          <div>
            <dt>Brand</dt>
            <dd>{selectedRider.brand || "Unassigned"}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{selectedRider.city}</dd>
          </div>
          <div>
            <dt>Vehicle</dt>
            <dd>{demoRider.vehicle}</dd>
          </div>
          <div>
            <dt>Documents</dt>
            <dd>3 verified</dd>
          </div>
        </dl>
        <p className={s.pLabel}>Recent Activity</p>
        <ol className={s.activity}>
          {[
            ["Payment marked PAID", "23 Sep"],
            [`Assigned to ${selectedRider.brand || "Brand A"}`, "14 Mar"],
            ["Application approved", "12 Mar"],
            ["Registered", "10 Mar"],
          ].map(([t, d]) => (
            <li key={t}>
              <span className={s.aDot}>
                <IconCheck size={8} />
              </span>
              <span>{t}</span>
              <em>{d}</em>
            </li>
          ))}
        </ol>
      </aside>
    </motion.div>
  );
}

/* ---- Tab 2: Approvals Pipeline ---- */
function ApprovalsWorkspaceView() {
  return (
    <motion.div
      className={s.approvalsTabGrid}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease }}
    >
      <div className={s.approvalsLeft}>
        <div className={s.tabTitleBlock}>
          <span className={s.badgeLabel}>Structured Verification</span>
          <h3>5-Stage Approval Pipeline</h3>
          <p>Every applicant is thoroughly reviewed before any campaign access is unlocked.</p>
        </div>

        <ol className={s.approvalTimeline}>
          {approvalStages.map((st, i) => (
            <li key={st.status} className={s.approvalStageItem}>
              <span className={s.approvalNode}>
                <IconCheck size={12} />
              </span>
              <div className={s.approvalStageContent}>
                <div className={s.approvalStageHead}>
                  <StatusPill status={st.status} />
                  <span className={s.approvalStageWhen}>{st.when}</span>
                </div>
                <p className={s.approvalStageText}>{st.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className={s.approvalsRight}>
        <div className={s.applicantCard}>
          <div className={s.applicantPhotoWrap}>
            <Image src={riderApproved} alt="Approved rider" className={s.applicantPhoto} width={280} height={200} />
            <div className={s.applicantBadge}>
              <IconCheck size={14} /> Approved by Ops
            </div>
          </div>
          <div className={s.applicantDetails}>
            <div className={s.applicantHeader}>
              <div>
                <h4>{demoRider.name}</h4>
                <p className="num">{demoRider.id}</p>
              </div>
              <StatusPill status="APPROVED" />
            </div>
            <div className={s.docChecklist}>
              {["Driving Licence (Verified)", "ID / Aadhaar (Verified)", "Vehicle RC (Verified)"].map((doc) => (
                <div key={doc} className={s.docItem}>
                  <IconCheck size={13} className={s.docCheckIcon} />
                  <span>{doc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ---- Tab 3: Brand Assignments & Mapping ---- */
function BrandsWorkspaceView() {
  return (
    <motion.div
      className={s.brandsTabGrid}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease }}
    >
      <div className={s.brandsLeft}>
        <div className={s.tabTitleBlock}>
          <span className={s.badgeLabel}>Brand Allocation</span>
          <h3>Connected Fleet Assignment</h3>
          <p>Match approved riders to partner brands by city, zone, and vehicle type.</p>
        </div>

        <div className={s.brandWireBox}>
          <div className={s.wireRider}>
            <span className="avatar" style={{ width: 44, height: 44 }}>
              <Image src={avatar} alt="" width={44} height={44} />
            </span>
            <div>
              <b>{demoRider.name}</b>
              <em>{demoRider.id} · {demoRider.city}</em>
            </div>
          </div>

          <div className={s.wireConnector}>
            <span className={s.wireLine} />
            <span className={s.wirePill}>Assigned</span>
          </div>

          <div className={s.wireBrandList}>
            {brandConnections.map((b) => (
              <div key={b.k} className={`${s.wireBrandItem} ${b.on ? s.wireBrandActive : ""}`}>
                <span className="brand-mono" style={{ width: 28, height: 28, fontSize: 13 }}>
                  {b.k}
                </span>
                <div className={s.wireBrandInfo}>
                  <b>{b.name}</b>
                  <em>{b.meta}</em>
                </div>
                {b.on && <StatusPill status="ACTIVE" style={{ fontSize: 11 }} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={s.brandsRight}>
        <div className={s.historyCard}>
          <h4 className={s.historyTitle}>Assignment History</h4>
          <ol className={s.historyList}>
            {assignmentHistory.map((h) => (
              <li key={h.range} className={`${s.historyItem} ${h.current ? s.historyItemCurrent : ""}`}>
                <span className={s.historyDot} />
                <div className={s.historyDetails}>
                  <div className={s.historyHead}>
                    <b>{h.brand}</b>
                    {h.current && <StatusPill status="CURRENT" tone="info" style={{ fontSize: 11 }} />}
                  </div>
                  <span className={s.historyPlace}>{h.place}</span>
                  <span className={s.historyRange}>{h.range}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </motion.div>
  );
}

/* ---- Tab 4: 360° Rider Profile ---- */
function ProfileWorkspaceView() {
  const profileFields = [
    ["Company", demoRider.company],
    ["Location", `${demoRider.city}, ${demoRider.zone}`],
    ["Vehicle", demoRider.vehicle],
    ["Plate No.", demoRider.plate],
    ["Brand", demoRider.brand],
    ["Contact", demoRider.phone],
  ];

  return (
    <motion.div
      className={s.profileTabGrid}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease }}
    >
      {/* Central Profile Card */}
      <div className={s.profileMainCard}>
        <div className={s.profileHeader}>
          <span className="avatar" style={{ width: 56, height: 56 }}>
            <Image src={avatar} alt="" width={56} height={56} />
          </span>
          <div>
            <h3>{demoRider.name}</h3>
            <span className="num" style={{ fontSize: 13, color: "var(--muted-strong)" }}>{demoRider.id}</span>
          </div>
          <StatusPill status="ACTIVE" />
        </div>

        <dl className={s.profileFieldGrid}>
          {profileFields.map(([k, v]) => (
            <div key={k} className={s.profileField}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Profile Satellites */}
      <div className={s.profileSideGrid}>
        <div className={s.profileMiniCard}>
          <div className={s.miniCardHead}>
            <IconDoc size={15} />
            <span>Verified Documents</span>
          </div>
          <ul className={s.miniDocList}>
            {["Driving Licence", "ID Proof (Aadhaar)", "Vehicle RC"].map((d) => (
              <li key={d}>
                <span>{d}</span>
                <em><IconCheck size={11} /> Verified</em>
              </li>
            ))}
          </ul>
          <p className={s.privateNote}>
            <IconLock size={12} /> Encrypted &amp; RBAC protected
          </p>
        </div>

        <div className={s.profileMiniCard}>
          <div className={s.miniCardHead}>
            <IconWallet size={15} />
            <span>Payment Summary</span>
          </div>
          <div className={s.miniPayTotal}>
            <span>This Month</span>
            <b className="num">{inr(demoEarnings.month)}</b>
          </div>
          <ul className={s.miniPayList}>
            {demoPayments.slice(0, 2).map((p) => (
              <li key={p.txn}>
                <span>{p.date}</span>
                <b className="num">{inr(p.amount)}</b>
                <StatusPill status={p.status} style={{ fontSize: 10 }} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

/* ---- Tab 5: Connected Lifecycle ---- */
function LifecycleWorkspaceView() {
  const lifecycleSteps = [
    { n: "01", title: "Registration", desc: "Driver registers via mobile number, sets vehicle and profile details.", tag: "Self-service" },
    { n: "02", title: "Verification", desc: "Operations checks driving licence, ID, and vehicle registration certificate.", tag: "Ops Review" },
    { n: "03", title: "Assignment", desc: "Rider is assigned to active brand campaigns and target working routes.", tag: "Matching" },
    { n: "04", title: "Execution", desc: "Rider completes daily route activities and submits proof photos.", tag: "On Duty" },
    { n: "05", title: "Payout", desc: "Earnings verified and settled directly via UPI with transaction reference.", tag: "Settlement" },
  ];

  return (
    <motion.div
      className={s.lifecycleWrap}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease }}
    >
      <div className={s.tabTitleBlock}>
        <span className={s.badgeLabel}>End-to-End Workflow</span>
        <h3>One Connected System, Zero Fragmented Spreadsheets</h3>
        <p>From initial driver onboarding to verified bank payout, every operational touchpoint is unified.</p>
      </div>

      <div className={s.lifecycleGrid}>
        {lifecycleSteps.map((step) => (
          <div key={step.n} className={s.lifecycleCard}>
            <div className={s.lifecycleCardHead}>
              <span className={s.lifecycleNum}>{step.n}</span>
              <span className={s.lifecycleTag}>{step.tag}</span>
            </div>
            <h4 className={s.lifecycleTitle}>{step.title}</h4>
            <p className={s.lifecycleDesc}>{step.desc}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
