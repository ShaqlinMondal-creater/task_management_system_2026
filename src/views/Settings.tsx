import { useState } from "react";
import type { FormEvent } from "react";
import { Avatar, Field } from "../components/Bits";
import { Tabs } from "../components/System";
import { fitImage } from "../lib";
import { useStore } from "../store";
import { useToast } from "../toast";
import type { NoticeKind, UserSettings } from "../types";
import { ChangePassword } from "./Login";

export type ProfileTab = "account" | "notifications" | "appearance" | "language" | "timezone" | "security";

const TABS: { value: ProfileTab; label: string }[] = [
  { value: "account", label: "Account" },
  { value: "notifications", label: "Notifications" },
  { value: "appearance", label: "Appearance" },
  { value: "language", label: "Language" },
  { value: "timezone", label: "Timezone" },
  { value: "security", label: "Security" },
];

const NOTICES: { kind: NoticeKind; label: string }[] = [
  { kind: "assigned", label: "Task assigned" },
  { kind: "mention", label: "Mention" },
  { kind: "comment", label: "Comment" },
  { kind: "due", label: "Due soon" },
  { kind: "overdue", label: "Overdue" },
  { kind: "invite", label: "Project invitation" },
  { kind: "completed", label: "Task completed" },
  { kind: "status", label: "Status changed" },
];

const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC", "Pacific/Auckland"];
const PHOTO_LIMIT = 900_000;

export function Settings({ tab, onTab }: { tab: ProfileTab; onTab: (tab: ProfileTab) => void }) {
  const store = useStore();
  const push = useToast();
  const user = store.sessionUser;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [mobile, setMobile] = useState(user?.mobile ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [photo, setPhoto] = useState(user?.photo ?? "");
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const settings = user.settings ?? {};
  const zone = settings.timezone || "Asia/Kolkata";
  const locale = settings.language === "hi" ? "hi-IN" : "en-IN";

  const saveSettings = (patch: Partial<UserSettings>) => {
    const current = user.settings ?? {};
    const message = store.updateUser(user.id, {
      settings: {
        ...current,
        ...patch,
        notices: { ...current.notices, ...patch.notices },
      },
    });
    if (message) setError(message);
    else push("Settings saved");
  };

  const saveAccount = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (mobile.trim() && !/^[0-9]{8,15}$/.test(mobile.trim())) {
      setError("Mobile is digits only, 8 to 15 numbers.");
      return;
    }
    const message = store.updateUser(user.id, {
      name: name.trim(),
      email: email.trim(),
      mobile: mobile.trim(),
      bio: bio.trim(),
      photo,
    });
    if (message) setError(message);
    else {
      setError(null);
      push("Profile saved");
    }
  };

  const readPhoto = (file: File | undefined) => {
    if (!file) return;
    void fitImage(file).then((next) => {
      if (next.length > PHOTO_LIMIT) {
        setError("That photo is too large. Use a smaller image.");
        return;
      }
      setPhoto(next);
      setError(null);
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : "That photo could not be saved."));
  };

  const clock = new Date().toLocaleString(locale, { timeZone: zone, dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="stack">
      <p className="muted">This account. Name, photo, email, mobile, and bio show in the menu after you save.</p>
      <Tabs value={tab} onChange={(value) => onTab(value as ProfileTab)} options={TABS} />
      {error && <p className="form-error">{error}</p>}

      {tab === "account" && (
        <form className="panel stack" onSubmit={saveAccount}>
          <div className="photo-row">
            <Avatar name={name || user.name} id={user.id} photo={photo} large />
            <div className="stack">
              <strong>Profile image</strong>
              <input className="control" type="file" accept="image/*" onChange={(event) => readPhoto(event.target.files?.[0])} />
              {photo && <button type="button" className="btn ghost small" onClick={() => setPhoto("")}>Remove image</button>}
            </div>
          </div>
          <div className="form-grid">
            <Field label="Name">
              <input className="control" value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label="Email">
              <input className="control" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </Field>
            <Field label="Mobile">
              <input className="control" inputMode="numeric" value={mobile} placeholder="Digits only" onChange={(event) => setMobile(event.target.value)} />
            </Field>
            <Field label="Bio" wide>
              <textarea className="control" rows={3} value={bio} onChange={(event) => setBio(event.target.value)} />
            </Field>
          </div>
          <div className="form-actions">
            <button className="btn primary" type="submit">Save profile</button>
          </div>
        </form>
      )}

      {tab === "account" && (
        <div className="panel stack">
          <h3>Password</h3>
          <ChangePassword onDone={() => push("Password updated")} />
        </div>
      )}

      {tab === "notifications" && (
        <div className="panel stack">
          <p className="muted">These switches control the bell for this account.</p>
          <div className="notice-list">
            {NOTICES.map((item) => (
              <label key={item.kind}>
                <input
                  type="checkbox"
                  checked={settings.notices?.[item.kind] !== false}
                  onChange={(event) => saveSettings({ notices: { [item.kind]: event.target.checked } })}
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {tab === "appearance" && (
        <div className="panel stack">
          <p className="muted">Comfortable is the normal desk. Compact tightens the page.</p>
          <div className="choice-row">
            <button type="button" className={settings.density === "compact" ? "btn ghost" : "btn ghost on"} onClick={() => saveSettings({ density: "comfortable" })}>Comfortable</button>
            <button type="button" className={settings.density === "compact" ? "btn ghost on" : "btn ghost"} onClick={() => saveSettings({ density: "compact" })}>Compact</button>
          </div>
        </div>
      )}

      {tab === "language" && (
        <div className="panel stack">
          <p className="muted">Dates on this page use the language you pick. The rest of the desk stays in English.</p>
          <Field label="Language">
            <select className="control" value={settings.language ?? "en"} onChange={(event) => saveSettings({ language: event.target.value as "en" | "hi" })}>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </Field>
          <p>{clock}</p>
        </div>
      )}

      {tab === "timezone" && (
        <div className="panel stack">
          <Field label="Timezone">
            <select className="control" value={zone} onChange={(event) => saveSettings({ timezone: event.target.value })}>
              {ZONES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <p>{clock}</p>
        </div>
      )}

      {tab === "security" && (
        <div className="panel stack">
          <h3>Password</h3>
          <ChangePassword onDone={() => push("Password updated")} />
          <div className="fact-grid">
            <div><span>Idle sign-out</span><strong>30 minutes</strong></div>
            <div><span>Remember me</span><strong>14 days</strong></div>
          </div>
          <button type="button" className="btn ghost" onClick={() => store.logout()}>Sign out</button>
        </div>
      )}
    </div>
  );
}
