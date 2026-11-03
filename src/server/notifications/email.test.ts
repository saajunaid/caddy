import { describe, expect, it } from "vitest";
import { composeEmail, EMAIL_KINDS, emailFromEnv } from "./email";

const app = "https://caddy.example";

describe("emailFromEnv", () => {
  it("stays off until both the Gmail address and app password are set", () => {
    expect(emailFromEnv({})).toBeNull();
    expect(emailFromEnv({ SMTP_USER: "caddy@example.test" })).toBeNull();
    expect(emailFromEnv({ SMTP_PASSWORD: "x" })).toBeNull();
  });

  it("defaults to Gmail over TLS and sends as Caddy", () => {
    expect(
      emailFromEnv({ SMTP_USER: "caddy@example.test", SMTP_PASSWORD: "pw" }),
    ).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      user: "caddy@example.test",
      password: "pw",
      from: "Caddy <caddy@example.test>",
    });
  });

  it("accepts another SMTP server", () => {
    expect(
      emailFromEnv({
        SMTP_USER: "u",
        SMTP_PASSWORD: "p",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "54325",
        EMAIL_FROM: "Test <t@example.test>",
      }),
    ).toMatchObject({
      host: "127.0.0.1",
      port: 54325,
      from: "Test <t@example.test>",
    });
  });
});

describe("EMAIL_KINDS", () => {
  it("emails urgent alerts but not quiet summaries or news", () => {
    expect(EMAIL_KINDS).toContain("housing.match");
    expect(EMAIL_KINDS).toContain("system.jobs_missing");
    expect(EMAIL_KINDS).toContain("digest");
    expect(EMAIL_KINDS).not.toContain("digest.quiet");
    expect(EMAIL_KINDS).not.toContain("housing.news");
    expect(EMAIL_KINDS).not.toContain("family.events_today");
  });
});

describe("composeEmail", () => {
  it("uses the alert title as the subject for a single alert", () => {
    const email = composeEmail(
      [
        {
          title: "New match: Ard na Sailí, Limerick",
          body: "3 bed house from €1,195 a month",
          actionUrl: "/housing/abc",
          severity: "success",
        },
      ],
      app,
    );
    expect(email.subject).toBe("Caddy: New match: Ard na Sailí, Limerick");
    expect(email.text).toContain("3 bed house from €1,195 a month");
    expect(email.text).toContain("https://caddy.example/housing/abc");
    expect(email.html).toContain('href="https://caddy.example/housing/abc"');
    expect(email.text).toContain("https://caddy.example/settings");
  });

  it("combines several alerts into one email and flags urgent ones", () => {
    const email = composeEmail(
      [
        { title: "A", body: null, actionUrl: null, severity: "info" },
        { title: "B", body: null, actionUrl: "/money", severity: "critical" },
      ],
      app,
    );
    expect(email.subject).toBe("Caddy: 2 alerts, some urgent");
    expect(email.text).toContain("https://caddy.example/inbox");
    expect(email.text).toContain("https://caddy.example/money");
  });

  it("escapes HTML in titles and bodies", () => {
    const email = composeEmail(
      [
        {
          title: "<script>x</script>",
          body: 'Tom & "Jerry"',
          actionUrl: "/inbox",
          severity: "info",
        },
      ],
      app,
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Tom &amp; &quot;Jerry&quot;");
  });
});
