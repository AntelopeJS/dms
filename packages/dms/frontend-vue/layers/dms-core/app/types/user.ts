/** A stored profile picture: the file's resource key. */
export interface UserAvatar {
  key: string;
}

export interface User {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
  email: string;
  name: string;
  language: string;
  isValidated: boolean;
  avatar?: UserAvatar | null;
}
