-- Replace old protocol category naming with explicit business meal categories
UPDATE "ExpenseCategory"
SET "active" = FALSE
WHERE "name" = 'Client Entertainment';

INSERT INTO "ExpenseCategory" ("id", "name", "expenseType", "defaultBudget", "requiresReceipt", "active")
VALUES ('protocol-business-lunch', 'Business Lunch', 'PROTOCOL', 0, TRUE, TRUE)
ON CONFLICT ("name") DO UPDATE
SET "expenseType" = EXCLUDED."expenseType",
    "defaultBudget" = EXCLUDED."defaultBudget",
    "requiresReceipt" = EXCLUDED."requiresReceipt",
    "active" = TRUE;

INSERT INTO "ExpenseCategory" ("id", "name", "expenseType", "defaultBudget", "requiresReceipt", "active")
VALUES ('protocol-business-dinner', 'Business Dinner', 'PROTOCOL', 0, TRUE, TRUE)
ON CONFLICT ("name") DO UPDATE
SET "expenseType" = EXCLUDED."expenseType",
    "defaultBudget" = EXCLUDED."defaultBudget",
    "requiresReceipt" = EXCLUDED."requiresReceipt",
    "active" = TRUE;
