export type ActionState = {
  error: string | null;
  success?: string | null;
};

export const INITIAL_ACTION_STATE: ActionState = {
  error: null,
  success: null,
};
