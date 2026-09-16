export const emailFontFamily =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const emailStyles = {
  main: {
    backgroundColor: "#f6f9fc",
    fontFamily: emailFontFamily,
  },
  container: {
    padding: "20px 0 48px",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    padding: "40px",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  },
  logo: {
    marginBottom: "32px",
  },
  logoImage: {
    height: "60px",
    margin: "0 auto",
    display: "block",
  },
  heading: {
    color: "#1a1a1a",
    fontSize: "24px",
    fontWeight: "600",
    margin: "0 0 24px",
    textAlign: "center" as const,
  },
  text: {
    color: "#525252",
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "0 0 16px",
  },
  otp: {
    box: {
      backgroundColor: "#f4f4f5",
      borderRadius: "6px",
      margin: "24px 0",
      padding: "20px",
      textAlign: "center" as const,
    },
    label: {
      color: "#71717a",
      fontSize: "13px",
      margin: "0 0 8px",
      textAlign: "center" as const,
    },
    code: {
      color: "#18181b",
      fontSize: "32px",
      fontWeight: "700",
      letterSpacing: "6px",
      margin: "0",
      fontFamily: '"SF Mono", Monaco, "Courier New", monospace',
    },
  },
  buttonContainer: {
    margin: "24px 0",
    textAlign: "center" as const,
  },
  button: {
    backgroundColor: "#18181b",
    borderRadius: "6px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: "600",
    padding: "12px 24px",
    textDecoration: "none",
  },
  expires: {
    color: "#71717a",
    fontSize: "13px",
    margin: "0",
    textAlign: "center" as const,
  },
  divider: {
    borderTop: "1px solid #e4e4e7",
    margin: "32px 0",
  },
  footer: {
    color: "#a1a1aa",
    fontSize: "12px",
    lineHeight: "1.5",
    margin: "0",
    textAlign: "center" as const,
  },
};
