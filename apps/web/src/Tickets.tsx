import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api.ts";
import type { Ticket, TicketMessage, User } from "./api.ts";

export function Tickets({ user }: { user: User }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [subject, setSubject] = useState("");
  const [initialMessage, setInitialMessage] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const mutation = useRef(0);
  const ticket = tickets.find((item) => item.id === selected);
  const canChat =
    ticket && (user.role === "estudiante" || ticket.assigned_to === user.id);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      const version = mutation.current;
      try {
        const items = await api.getTickets(controller.signal);
        const active = items.find((item) => item.id === selected);
        const chat =
          active &&
          active.status !== "closed" &&
          (user.role === "estudiante" || active.assigned_to === user.id)
            ? await api.getMessages(selected, controller.signal)
            : [];
        if (
          controller.signal.aborted ||
          current !== generation.current ||
          version !== mutation.current
        )
          return;
        setTickets(items);
        setMessages(chat);
        setError("");
      } catch (err) {
        if (!controller.signal.aborted && current === generation.current)
          setError(
            err instanceof Error ? err.message : "Could not load tickets",
          );
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 3000);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
      generation.current = current + 1;
    };
  }, [selected, user.id, user.role]);

  async function run(action: () => Promise<void>) {
    const current = generation.current;
    mutation.current++;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      if (current === generation.current)
        setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      mutation.current++;
      if (current === generation.current) setBusy(false);
    }
  }
  function create(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const current = generation.current;
      const created = await api.createTicket(
        subject.trim(),
        initialMessage.trim(),
      );
      if (current !== generation.current) return;
      setTickets((items) => [created, ...items]);
      setSelected(created.id);
      setSubject("");
      setInitialMessage("");
    });
  }
  function send(e: FormEvent) {
    e.preventDefault();
    const current = generation.current;
    void run(async () => {
      const sent = await api.sendMessage(selected, body.trim());
      if (current !== generation.current) return;
      setMessages((items) => [
        ...items.filter((item) => item.id !== sent.id),
        sent,
      ]);
      setBody("");
    });
  }
  function update(action: "claim" | "close") {
    if (
      action === "close" &&
      !window.confirm(
        "Close this ticket? Its conversation will be permanently deleted.",
      )
    )
      return;
    const current = generation.current;
    void run(async () => {
      const updated = await (action === "claim"
        ? api.claimTicket(selected)
        : api.closeTicket(selected));
      if (current !== generation.current) return;
      setTickets((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (action === "close") {
        setMessages([]);
        setBody("");
      }
    });
  }
  return (
    <section>
      <h2>Support Tickets</h2>
      <p>
        Chat with support. Closing a ticket permanently deletes its
        conversation.
      </p>
      {error && (
        <p role="alert" className="alert alert-error">
          {error}
        </p>
      )}
      {user.role === "estudiante" && (
        <form className="card" onSubmit={create}>
          <h3>New ticket</h3>
          <label htmlFor="ticket-subject">Subject</label>
          <input
            id="ticket-subject"
            className="form-control"
            required
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <label htmlFor="ticket-initial">Message</label>
          <textarea
            id="ticket-initial"
            className="form-control"
            required
            maxLength={2000}
            value={initialMessage}
            onChange={(e) => setInitialMessage(e.target.value)}
          />
          <button
            className="btn btn-primary"
            disabled={busy || !subject.trim() || !initialMessage.trim()}
          >
            Create ticket
          </button>
        </form>
      )}
      <div className="card">
        <h3>Tickets</h3>
        {!tickets.length && <p>No tickets yet.</p>}
        {tickets.map((item) => (
          <button
            key={item.id}
            type="button"
            className="btn btn-secondary"
            aria-pressed={selected === item.id}
            onClick={() => {
              if (selected === item.id) return;
              generation.current++;
              setSelected(item.id);
              setMessages([]);
              setBody("");
              setError("");
              setBusy(false);
            }}
          >
            {item.subject} · {item.status}
            {item.assigned_to === user.id ? " · Assigned to you" : ""}
          </button>
        ))}
      </div>
      {ticket && (
        <div className="card">
          <h3>{ticket.subject}</h3>
          <p>Status: {ticket.status}</p>
          {ticket.status === "closed" ? (
            <p>
              The ticket is closed. Its conversation has been permanently
              deleted.
            </p>
          ) : (
            <>
              {user.role === "soporte" && !ticket.assigned_to && (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => update("claim")}
                >
                  Claim ticket
                </button>
              )}
              {user.role === "soporte" && ticket.assigned_to && !canChat && (
                <p>Assigned to another support agent.</p>
              )}
              {canChat && (
                <>
                  <div
                    role="log"
                    aria-label="Ticket conversation"
                    aria-live="polite"
                  >
                    {messages.map((message) => (
                      <p key={message.id}>
                        <strong>
                          {message.sender_id === user.id
                            ? "You"
                            : user.role === "estudiante"
                              ? "Support"
                              : "Student"}
                          :
                        </strong>{" "}
                        {message.body}{" "}
                        <small>
                          {new Date(message.created_at).toLocaleString()}
                        </small>
                      </p>
                    ))}
                  </div>
                  <form onSubmit={send}>
                    <label htmlFor="ticket-reply">Reply</label>
                    <textarea
                      id="ticket-reply"
                      className="form-control"
                      required
                      maxLength={2000}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                    />
                    <button
                      className="btn btn-primary"
                      disabled={busy || !body.trim()}
                    >
                      Send
                    </button>
                  </form>
                  {user.role === "soporte" && (
                    <button
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={() => update("close")}
                    >
                      Close ticket and delete conversation
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
