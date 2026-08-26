-- The gate stops pretending it can say no.
--
-- P1.0.4 was written as an accept-or-decline: "Record viability verdict",
-- STRONG / MODERATE / WEAK, "on weak fit advise building blog or SEO content
-- first before Pinterest makes sense". By the time anyone opens it the client
-- has already bought the service and work is starting either way, so the one
-- decision it asked for is a decision nobody is going to make. A gate that
-- cannot reject becomes a formality that gets clicked through, and then the
-- reasoning behind it stops being written.
--
-- What is actually worth recording at that moment is what we are walking into:
-- how much room the account has, and what the client needs to be told about
-- pace. That is a real judgement, it is different per client, and it is what
-- the risk screen wants to compare against in month three.
--
-- The stored values (STRONG_FIT / MODERATE_FIT / WEAK_FIT) do not change. They
-- are identifiers, the expansion module reads the same three, and renaming an
-- enum to improve a button label is how you break two things to fix one. The
-- labels HIGH POTENTIAL / AVERAGE / CHALLENGING live in task-fields.ts.

UPDATE organic.task_definitions
   SET name = 'Assess account potential',
       guidance = 'How much room is in this account: high potential, average, or challenging. The client has already signed, so this is not go/no-go — it sets the plan and what they are told about pace. On challenging, say so in writing now.'
 WHERE id = 'P1.0.4';
