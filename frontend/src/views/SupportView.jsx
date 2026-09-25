import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Search, Send, RotateCcw, CheckCircle2, XCircle, Wifi, WifiOff } from 'lucide-react';
import { api } from '../services/api';
import { subscribeSignals } from '../services/realtime';
import { toast } from '../components/Feedback';
import { EmptyState } from '../components/CampaignShared';

const FILTERS = [
  ['ACTIVE', 'Active'],
  ['WAITING_FOR_ADMIN', 'Waiting for support'],
  ['WAITING_FOR_RIDER', 'Waiting for rider'],
  ['OPEN', 'Open'],
  ['RESOLVED', 'Resolved'],
  ['CLOSED', 'Closed'],
  ['ALL', 'All'],
];
const STATUS_PILL = {
  OPEN: 'pill-open',
  WAITING_FOR_ADMIN: 'pill-pending',
  WAITING_FOR_RIDER: 'pill-requested',
  RESOLVED: 'pill-completed',
  CLOSED: 'pill-draft',
};
// Server times are UTC without a zone marker; show them in IST.
const when = (value, withDate = true) =>
  value
    ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`).toLocaleString('en-GB', {
        timeZone: 'Asia/Kolkata',
        ...(withDate ? { day: '2-digit', month: 'short' } : {}),
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

/** Support inbox: every rider conversation, updated live through realtime signals. */
export default function SupportView() {
  const [filter, setFilter] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [list, setList] = useState(null);
  const [counts, setCounts] = useState({});
  const [agents, setAgents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [live, setLive] = useState('CONNECTING');
  const selectedRef = useRef(null);
  selectedRef.current = selectedId;
  const [chatTick, setChatTick] = useState(0); // Bumped by a signal for the open conversation

  const loadList = useCallback(
    () =>
      api
        .getSupportConversations({ status: filter, search: search.trim(), assigned_admin_id: assignee, date_from: dateFrom })
        .then((res) => {
          setList(res.conversations);
          setCounts(res.counts || {});
        })
        .catch((err) => toast.error(err.message)),
    [filter, search, assignee, dateFrom]
  );

  useEffect(() => {
    const t = setTimeout(loadList, 250);
    return () => clearTimeout(t);
  }, [loadList]);

  useEffect(() => {
    api.getSupportAgents().then(setAgents).catch(() => {});
  }, []);

  // Realtime: one signal per change; refetch the list, and the open chat if it's the one that changed.
  const loadListRef = useRef(loadList);
  loadListRef.current = loadList;
  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    api
      .getSupportRealtime()
      .then((config) => {
        if (cancelled) return;
        unsubscribe = subscribeSignals(
          config,
          (payload) => {
            loadListRef.current();
            if (payload.conversation_id === selectedRef.current) setChatTick((n) => n + 1);
          },
          (status) => setLive(status)
        );
      })
      .catch(() => setLive('OFF'));
    // Safety net only (e.g. a dropped connection): a slow refresh and one when the tab regains focus.
    const onFocus = () => loadListRef.current();
    window.addEventListener('focus', onFocus);
    const slow = setInterval(() => document.visibilityState === 'visible' && loadListRef.current(), 60000);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener('focus', onFocus);
      clearInterval(slow);
    };
  }, []);

  const liveOk = live === 'SUBSCRIBED';

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Support</h1>
          <p className="page-subtitle">Rider conversations from the FlexRiders app. Replies reach the rider instantly.</p>
        </div>
        <span className={`support-live ${liveOk ? 'on' : ''}`} title={liveOk ? 'Live updates connected' : 'Live updates not connected; refreshing periodically'}>
          {liveOk ? <Wifi size={14} /> : <WifiOff size={14} />} {liveOk ? 'Live' : live === 'CONNECTING' ? 'Connecting…' : 'Offline'}
        </span>
      </div>

      <div className="support-counts">
        {[
          ['Unread messages', counts.unread_messages],
          ['Waiting for support', counts.WAITING_FOR_ADMIN],
          ['Waiting for rider', counts.WAITING_FOR_RIDER],
          ['Open', counts.OPEN],
          ['Resolved', counts.RESOLVED],
        ].map(([label, value]) => (
          <div key={label} className="kpi">
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{value ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="support-layout">
        <div className="card support-list">
          <div className="support-list-tools">
            <div className="search-container support-search">
              <Search size={15} color="#94A3B8" />
              <input className="search-input" placeholder="Rider, phone, subject or campaign…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="support-filter-row">
              <label className="support-filter">
                <span>Status</span>
                <select className="form-input" value={filter} onChange={(e) => setFilter(e.target.value)}>
                  {FILTERS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="support-filter">
                <span>Assigned to</span>
                <select className="form-input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Anyone</option>
                  <option value="-1">Unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="support-filter support-filter-date">
              <span>Updated since</span>
              <input type="date" className="form-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              {dateFrom ? (
                <button type="button" className="card-action-link" onClick={() => setDateFrom('')}>
                  Clear
                </button>
              ) : null}
            </label>
          </div>
          <div className="support-items">
            {(list || []).map((c) => (
              <button key={c.id} className={`support-item ${c.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(c.id)}>
                <div className="support-item-top">
                  <strong>{c.rider ? c.rider.full_name : 'Rider'}</strong>
                  <span className="support-item-time">{when(c.last_message_at || c.updated_at)}</span>
                </div>
                <div className="support-item-subject">{c.subject}</div>
                <div className="support-item-preview">{c.last_message_preview}</div>
                <div className="support-item-meta">
                  <span className={`status-pill ${STATUS_PILL[c.status] || ''}`}>{c.status_label}</span>
                  {c.campaign_name ? <span className="support-chip">{c.campaign_name}</span> : null}
                  {c.unread ? <span className="support-unread">{c.unread}</span> : null}
                </div>
              </button>
            ))}
            {list && list.length === 0 ? <EmptyState icon={MessageSquare}>No conversations here.</EmptyState> : null}
            {!list ? <EmptyState icon={MessageSquare}>Loading…</EmptyState> : null}
          </div>
        </div>

        <div className="card support-chat">
          {selectedId ? (
            <Chat key={selectedId} conversationId={selectedId} tick={chatTick} agents={agents} onChanged={loadList} />
          ) : (
            <EmptyState icon={MessageSquare}>Select a conversation to read and reply.</EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}

function Chat({ conversationId, tick, agents, onChanged }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);

  // Loads the newest page and merges it with what's shown (older pages already loaded stay).
  const refresh = useCallback(async () => {
    const res = await api.getSupportMessages(conversationId);
    setConversation(res.conversation);
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      res.messages.forEach((m) => byId.set(m.id, m));
      return [...byId.values()].sort((a, b) => a.id - b.id);
    });
    if (res.conversation.unread) {
      api.markSupportRead(conversationId).then(() => onChanged()).catch(() => {});
    }
    return res;
  }, [conversationId]);

  useEffect(() => {
    refresh()
      .then((res) => {
        setHasMore(res.has_more); // Only the first page decides whether older messages exist
        setTimeout(() => bottomRef.current && bottomRef.current.scrollIntoView(), 50);
      })
      .catch((err) => toast.error(err.message));
  }, [conversationId]);

  useEffect(() => {
    if (!tick) return;
    const el = scrollRef.current;
    const nearBottom = el && el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    refresh()
      .then(() => nearBottom && setTimeout(() => bottomRef.current && bottomRef.current.scrollIntoView({ behavior: 'smooth' }), 50))
      .catch(() => {});
  }, [tick]);

  const loadOlder = async () => {
    if (!messages.length) return;
    const el = scrollRef.current;
    const before = el ? el.scrollHeight : 0;
    const res = await api.getSupportMessages(conversationId, messages[0].id);
    setMessages((prev) => [...res.messages, ...prev]);
    setHasMore(res.has_more);
    requestAnimationFrame(() => el && (el.scrollTop = el.scrollHeight - before));
  };

  const send = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const res = await api.sendSupportMessage(conversationId, text);
      setDraft('');
      setConversation(res.conversation);
      setMessages((prev) => [...prev.filter((m) => m.id !== res.message.id), res.message]);
      setTimeout(() => bottomRef.current && bottomRef.current.scrollIntoView({ behavior: 'smooth' }), 50);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const update = async (changes, done) => {
    try {
      const c = await api.updateSupportConversation(conversationId, changes);
      setConversation(c);
      await refresh();
      onChanged();
      if (done) toast.success(done);
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (!conversation) return <EmptyState icon={MessageSquare}>Loading conversation…</EmptyState>;
  const c = conversation;
  const closed = c.status === 'CLOSED';
  const finished = c.status === 'RESOLVED' || closed;

  return (
    <div className="chat-wrap">
      <div className="chat-header">
        <div style={{ minWidth: 0 }}>
          <div className="chat-title">{c.subject}</div>
          <div className="chat-sub">
            {c.rider ? `${c.rider.full_name} · ${c.rider.rider_id} · ${c.rider.mobile_number}` : 'Rider'}
            {c.campaign_name ? ` · Campaign: ${c.campaign_name}` : ''}
          </div>
        </div>
        <div className="chat-actions">
          <span className={`status-pill ${STATUS_PILL[c.status] || ''}`}>{c.status_label}</span>
          <select
            className="form-input"
            value={c.assigned_admin ? c.assigned_admin.id : ''}
            onChange={(e) => update(e.target.value ? { assigned_admin_id: Number(e.target.value) } : { unassign: true }, 'Assignment updated.')}
            title="Assigned admin"
          >
            <option value="">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
          {!finished ? (
            <button className="btn-secondary" onClick={() => update({ status: 'RESOLVED' }, 'Marked as resolved.')}>
              <CheckCircle2 size={15} /> Resolve
            </button>
          ) : null}
          {finished ? (
            <button className="btn-secondary" onClick={() => update({ status: 'OPEN' }, 'Conversation reopened.')}>
              <RotateCcw size={15} /> Reopen
            </button>
          ) : null}
          {!closed ? (
            <button className="btn-secondary" onClick={() => update({ status: 'CLOSED' }, 'Conversation closed.')}>
              <XCircle size={15} /> Close
            </button>
          ) : null}
        </div>
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {hasMore ? (
          <button className="card-action-link chat-older" onClick={loadOlder}>
            Load earlier messages
          </button>
        ) : null}
        {messages.map((m) =>
          m.sender_type === 'SYSTEM' ? (
            <div key={m.id} className="chat-system">
              {m.body} · {when(m.created_at)}
            </div>
          ) : (
            <div key={m.id} className={`chat-bubble ${m.sender_type === 'ADMIN' ? 'mine' : 'theirs'}`}>
              <div className="chat-bubble-name">{m.sender_type === 'ADMIN' ? m.sender_name || 'Support' : c.rider ? c.rider.full_name : 'Rider'}</div>
              <div className="chat-bubble-body">{m.body}</div>
              <div className="chat-bubble-time">
                {when(m.created_at)}
                {m.sender_type === 'ADMIN' ? (m.id <= c.other_side_read_id ? ' · Seen' : ' · Sent') : ''}
              </div>
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input" onSubmit={send}>
        <textarea
          className="form-input"
          rows={2}
          value={draft}
          maxLength={2000}
          disabled={closed}
          placeholder={closed ? 'Reopen the conversation to reply.' : 'Type a reply…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) send(e);
          }}
        />
        <button type="submit" className="btn-primary" disabled={closed || sending || !draft.trim()}>
          <Send size={15} /> {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
