export interface User {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
  email: string;
  name: string;
  language: string;
  isValidated: boolean;
}
