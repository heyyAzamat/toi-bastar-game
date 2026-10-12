// Where api/* lives. Empty on Vercel (same origin); the iDos Games build sets VITE_API_BASE to the Vercel host.
export const apiUrl = (path: string) => `${import.meta.env.VITE_API_BASE ?? ''}${path}`;
