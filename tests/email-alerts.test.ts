import { describe, expect, it } from "vitest";
import { parseAlertMessage } from "../src/email-alerts.js";

describe("email alert discovery", () => {
  it("imports a target-company LinkedIn job alert", () => {
    const jobs = parseAlertMessage({
      from: "LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>",
      subject: "New frontend jobs at Microsoft",
      date: "2026-08-19T06:00:00Z",
      html: `<table><tr><td>
        <a href="https://www.linkedin.com/comm/jobs/view/frontend-engineer-at-microsoft-4250012345?trackingId=abc">Frontend Engineer</a>
        <p>Microsoft · Bengaluru, India · React and TypeScript</p>
      </td></tr></table>`,
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      companyId: "microsoft",
      source: "linkedin",
      title: "Frontend Engineer",
      location: "India, Bengaluru",
      url: "https://www.linkedin.com/jobs/view/4250012345",
    });
  });

  it("imports an Instahyre recommendation and ignores non-target companies", () => {
    const jobs = parseAlertMessage({
      from: "Instahyre <jobs@instahyre.com>",
      subject: "Jobs selected for you",
      html: `<ul>
        <li><strong>CRED</strong><a href="https://www.instahyre.com/job-frontend-engineer-cred-12345/?utm_source=email">Frontend Engineer</a></li>
        <li><strong>Another Startup</strong><a href="https://www.instahyre.com/job-backend-engineer-99999/">Backend Engineer</a></li>
      </ul>`,
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ companyId: "cred", source: "instahyre", title: "Frontend Engineer" });
  });

  it("does not accept messages from unrelated senders", () => {
    expect(
      parseAlertMessage({
        from: "attacker@example.com",
        html: '<a href="https://www.linkedin.com/jobs/view/123">Frontend Engineer at CRED</a>',
      }),
    ).toEqual([]);
    expect(
      parseAlertMessage({
        from: "LinkedIn Alerts <spoof@linkedin.com.example.org>",
        html: '<a href="https://www.linkedin.com/jobs/view/123">Frontend Engineer at CRED</a>',
      }),
    ).toEqual([]);
  });
});
