/**
 * Weekly Update Sync — tweede poging. Draait maandag 12:30 UTC, een half uur na
 * de eerste (zie vercel.json), en voert exact dezelfde run uit.
 *
 * WAAROM DIT EEN EIGEN PAD IS
 * ---------------------------
 * Puur omdat de crons in vercel.json een uniek pad nodig hebben. De logica
 * staat één keer, in de route hiernaast; hier worden alleen dezelfde handlers
 * opnieuw geëxporteerd.
 *
 * WAAROM EEN TWEEDE RUN VEILIG IS
 * -------------------------------
 * De sync is idempotent: een weekregel waar spend (en revenue) al in staan is
 * bevroren en wordt overgeslagen, nog vóór de Pinterest-call. Deze run doet dus
 * niets als de eerste geslaagd is (~5 seconden, geen enkele mutatie), en maakt
 * hem af als hij halverwege werd afgekapt -- het scenario van 17-08-2026, waar
 * 24 stores zonder cijfers achterbleven. Late conversies kunnen langs deze weg
 * geen cijfers wijzigen die al verstuurd zijn; dat is dezelfde vries-regel.
 */
export const maxDuration = 300;

export { GET, POST } from "../weekly-update-sync/route";
