/**
 * Canonical server-action / mutation result shape.
 * Prefer this over domain-local ActionResult aliases.
 */
export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export function actionOk(): ActionResult<undefined>;
export function actionOk<T>(data: T): ActionResult<T>;
export function actionOk<T>(data?: T): ActionResult<T | undefined> {
  return { success: true, data: data as T | undefined };
}

export function actionFail(error: string): ActionResult<never> {
  return { success: false, error };
}
