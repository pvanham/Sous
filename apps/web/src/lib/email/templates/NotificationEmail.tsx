import { Button, Section, Text } from "@react-email/components";
import { BaseLayout } from "./BaseLayout";

/**
 * Single transactional email template used by every notification
 * category. Each category supplies its own copy + optional CTA via
 * `NotificationService.notify`, so the dispatcher doesn't have to
 * conditionally swap templates per category. If a category needs a
 * radically different layout later, it can drop in its own component
 * and the dispatcher will not change.
 */
export interface NotificationEmailProps {
  preview: string;
  heading: string;
  /** Body paragraphs. Each entry renders as its own `<Text>` block. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  footer?: string;
}

const buttonStyle = {
  backgroundColor: "#92400e",
  color: "#ffffff",
  borderRadius: "6px",
  padding: "10px 18px",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
};

const paragraphStyle = {
  margin: "0 0 12px 0",
};

export function NotificationEmail({
  preview,
  heading,
  paragraphs,
  cta,
  footer,
}: NotificationEmailProps) {
  return (
    <BaseLayout preview={preview} heading={heading} footer={footer}>
      {paragraphs.map((p, i) => (
        <Text key={i} style={paragraphStyle}>
          {p}
        </Text>
      ))}
      {cta ? (
        <Section style={{ marginTop: "16px" }}>
          <Button href={cta.url} style={buttonStyle}>
            {cta.label}
          </Button>
        </Section>
      ) : null}
    </BaseLayout>
  );
}
