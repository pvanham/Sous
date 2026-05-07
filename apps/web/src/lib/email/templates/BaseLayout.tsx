import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

/**
 * Base layout shared by every transactional email. Mirrors the warm
 * industrial palette used in the marketing site (`stone`/`amber`) so
 * a recipient sees a consistent brand whether they tap a push, open
 * the dashboard, or read this in their inbox.
 *
 * Inline styles only — most email clients (Outlook in particular)
 * don't honour `<style>` blocks reliably.
 */
export interface BaseLayoutProps {
  preview: string;
  heading: string;
  children: ReactNode;
  footer?: string;
}

const styles = {
  body: {
    backgroundColor: "#f5f5f4",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    margin: 0,
    padding: 0,
  },
  container: {
    backgroundColor: "#ffffff",
    margin: "0 auto",
    maxWidth: "560px",
    padding: "32px",
    borderRadius: "8px",
  },
  heading: {
    color: "#1c1917",
    fontSize: "20px",
    fontWeight: 600,
    marginBottom: "16px",
    marginTop: 0,
  },
  body_text: {
    color: "#292524",
    fontSize: "15px",
    lineHeight: "22px",
  },
  footer: {
    color: "#78716c",
    fontSize: "12px",
    lineHeight: "18px",
    marginTop: "32px",
    paddingTop: "16px",
    borderTop: "1px solid #e7e5e4",
  },
};

export function BaseLayout({
  preview,
  heading,
  children,
  footer,
}: BaseLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.heading}>{heading}</Heading>
          <Section style={styles.body_text}>{children}</Section>
          <Section style={styles.footer}>
            <Text style={{ margin: 0 }}>
              {footer ??
                "You're receiving this because you have notifications enabled in Sous. You can change which categories email you in the mobile app under Settings → Notifications."}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
