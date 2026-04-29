export interface RequestUser {
  id: string;
  email: string;
  role?: string;
}

export interface RequestWithUser {
  user?: RequestUser;
  headers: Record<string, string | string[] | undefined>;
}
