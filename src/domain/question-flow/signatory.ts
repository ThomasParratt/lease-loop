// Who may sign for a company that the applicant cannot sign for (D10, D39). There is no login
// (D17): the actor is the "continue as" picker's customer, and the signatory is named by e-mail
// in the application. A real check would send the signatory a one-time link; until then the
// rule keeps the obvious wrongs out: another name, another account, the admin.

const normalised = (email: string | undefined) => email?.trim().toLowerCase() ?? '';

/** Two e-mail addresses are the same one: case and the spaces around them do not count. */
export function sameEmail(a: string | undefined, b: string | undefined): boolean {
  const left = normalised(a);
  return left !== '' && left === normalised(b);
}

export type SignatoryClaim = {
  /** Who is acting: a customer id, `admin` or `anonymous`. */
  actor: string;
  /** The customer the application belongs to. */
  applicantId: string;
  /** The e-mail named in the application (`q_signatory_email`). */
  signatoryEmail: string | undefined;
  /** Who the person deciding says they are. */
  claimedBy: string;
};

/**
 * The named signatory may sign or decline, on the company's own account only: not another
 * customer, not anonymous and not the admin, who reviews but never signs for a company.
 */
export function mayDecideAsSignatory(claim: SignatoryClaim): boolean {
  return claim.actor === claim.applicantId && sameEmail(claim.claimedBy, claim.signatoryEmail);
}
