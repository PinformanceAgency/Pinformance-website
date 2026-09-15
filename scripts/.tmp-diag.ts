import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";
(async () => {
  const pool = organicPool();
  const roha = 'b545166f-ffb9-4320-9a09-11e4a20f6d23';
  console.log("=== ROHA topic coverage ===");
  console.table((await pool.query(
    `SELECT topic_name, active_boards::int, planned_boards::int, is_covered
       FROM organic.topic_coverage WHERE org_id=$1 ORDER BY topic_name`, [roha])).rows);
  console.log("=== ROHA urls_selectable ===");
  console.table((await pool.query(
    `SELECT u.name, u.cooldown_clear, u.topic_covered, u.assigned_boards::int, u.is_selectable,
            t.name AS topic
       FROM organic.urls_selectable u
       LEFT JOIN organic.topics t ON t.id=u.topic_id
      WHERE u.org_id=$1`, [roha])).rows);
  console.log("=== ROHA boards per topic (live only) ===");
  console.table((await pool.query(
    `SELECT COALESCE(t.name,'(no topic)') AS topic, b.status::text,
            COUNT(*)::int AS n
       FROM organic.boards b LEFT JOIN organic.topics t ON t.id=b.topic_id
      WHERE b.org_id=$1 GROUP BY 1,2 ORDER BY 1,2`, [roha])).rows);
  await pool.end();
})();
