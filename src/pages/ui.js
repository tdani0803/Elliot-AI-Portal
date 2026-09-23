// Tiny helpers shared by the auth pages.

export function showMessage(el, text) {
  el.textContent = text;
  el.hidden = !text;
}

export function setBusy(form, busy, busyLabel) {
  const button = form.querySelector('button[type="submit"]');
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.label;
}

// Plain-English versions of the auth errors a tradie might actually hit.
export function friendlyAuthError(error) {
  const msg = (error?.message ?? '').toLowerCase();
  if (msg.includes('invalid login')) return "That email and password don't match. Try again, or reset your password.";
  if (msg.includes('email not confirmed')) return 'Your account needs activating — check your email for the invite link.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Too many tries. Wait a minute and try again.';
  if (msg.includes('should be at least') || msg.includes('weak')) return 'That password is too short. Use at least 8 characters.';
  if (msg.includes('fetch') || msg.includes('network')) return "Can't reach the server. Check your internet and try again.";
  return 'Something went wrong. Try again, or give us a call.';
}
