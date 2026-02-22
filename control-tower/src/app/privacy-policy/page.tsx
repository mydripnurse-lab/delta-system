import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Delta Local Domain Bot",
  description: "Privacy Policy for Delta Local Domain Bot Chrome extension.",
};

const LAST_UPDATED = "February 22, 2026";

export default function PrivacyPolicyPage() {
  return (
    <main
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: "32px 20px 56px",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ marginTop: 0, opacity: 0.85 }}>
        Delta Local Domain Bot
      </p>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Last updated: {LAST_UPDATED}
      </p>

      <h2>1. Overview</h2>
      <p>
        This Privacy Policy explains how the Delta Local Domain Bot Chrome extension
        (&quot;Extension&quot;) handles information when used by authorized users.
      </p>

      <h2>2. What the Extension Does</h2>
      <p>
        The Extension automates domain setup actions in the user&apos;s currently
        logged-in browser session on approved internal web applications.
      </p>

      <h2>3. Data We Access</h2>
      <p>
        To perform automation steps, the Extension may access page content and user
        activity context on supported pages, including:
      </p>
      <ul>
        <li>Visible page elements (buttons, inputs, labels, and status text).</li>
        <li>Workflow values provided by the user or first-party internal tools.</li>
        <li>Execution logs needed to show run progress and troubleshooting details.</li>
      </ul>

      <h2>4. Permissions and Why They Are Used</h2>
      <ul>
        <li>
          <b>activeTab:</b> Runs automation only on tabs explicitly started by the user.
        </li>
        <li>
          <b>host permissions:</b> Limits automation to approved domains used by this workflow.
        </li>
        <li>
          <b>scripting:</b> Executes required automation logic in the page context.
        </li>
        <li>
          <b>tabs:</b> Opens activation pages, monitors readiness, and closes tabs after successful completion.
        </li>
        <li>
          <b>storage:</b> Stores lightweight local extension state/settings.
        </li>
      </ul>

      <h2>5. Data Sharing</h2>
      <p>
        We do not sell personal data. We do not use extension data for advertising.
        Data is used only to provide requested automation functionality.
      </p>

      <h2>6. Remote Code</h2>
      <p>
        The Extension does not fetch or execute remotely hosted JavaScript code.
        Executable logic is packaged with the Extension.
      </p>

      <h2>7. Data Retention</h2>
      <p>
        The Extension stores only minimal local state needed for operation. Runtime
        logs are intended for operational visibility and troubleshooting.
      </p>

      <h2>8. Security</h2>
      <p>
        We use reasonable technical measures to reduce unauthorized access and limit
        data handling to required workflow operations.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Updates will be posted on
        this page with a revised &quot;Last updated&quot; date.
      </p>

      <h2>10. Contact</h2>
      <p>
        For privacy questions, contact:{" "}
        <a href="mailto:support@telahagocrecer.com">support@telahagocrecer.com</a>
      </p>
    </main>
  );
}
