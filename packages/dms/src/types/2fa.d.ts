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
}
