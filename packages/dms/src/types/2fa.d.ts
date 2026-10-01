declare module "2fa" {
  interface VerifyOptions {
    drift?: number;
    step?: number;
    beforeDrift?: number;
    afterDrift?: number;
    length?: number;
  }

  export function generateKey(
    length: number,
    cb: (err: Error | null, key: string) => void,
  ): void;

  export function generateCode(
    key: string,
    counter?: number,
    opts?: VerifyOptions,
  ): string;

  export function verifyTOTP(
    key: string,
    code: string,
    opts?: VerifyOptions,
  ): boolean;

  export function verifyHOTP(
    key: string,
    code: string,
    counter: number,
    opts?: VerifyOptions,
  ): boolean;

  export function generateUrl(
    issuer: string,
    account: string,
    key: string,
  ): string;
  interface GoogleQrOptions {
    /** qr-image options; the result is always a PNG. */
    size?: number;
    margin?: number;
    ec_level?: "L" | "M" | "Q" | "H";
  }

  export function generateGoogleQR(
    issuer: string,
    account: string,
    key: string,
    opts: GoogleQrOptions,
    cb: (err: Error | null, dataUrl: string) => void,
  ): void;
}
