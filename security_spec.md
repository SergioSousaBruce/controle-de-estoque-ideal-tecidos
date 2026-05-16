# Security Specification for Ideal Tecidos

## 1. Data Invariants
- An inventory count must be linked to a `userId`.
- Users can only read and write their own inventory counts.
- `total` must match the sum of `sizes`. (Note: complex to enforce perfectly in rules without loops, but we can enforce types and bounds).
- `createdAt` is immutable after creation.
- `userId` must match the authenticated user.

## 2. The "Dirty Dozen" Payloads (Expected to be DENIED)
1. **Identity Spoofing**: Creating a record with a different `userId`.
2. **Access Violation**: Reading a record belonging to another user.
3. **Malicious Update**: Changing `userId` to take over a record.
4. **Immutability Breach**: Updating `createdAt` field.
5. **ID Poisoning**: Using a 2MB string as a document ID.
6. **Type Poisoning**: Sending `total` as a string instead of a number.
7. **Resource Exhaustion**: Sending a `sizes` object with 10,000 keys.
8. **Shadow Field**: Adding a `isAdmin: true` field to a user profile.
9. **Zero-Verify Attack**: Writing data as an unverified email user (if required).
10. **Terminal State Bypass**: Updating a record that should be locked (none yet, but good practice).
11. **Negative Inventory**: Sending negative numbers in the `sizes` grid.
12. **Foreign Collection Injection**: Trying to write to a collection not defined in the blueprint.

## 3. The Test Runner (Conceptual)
A test runner would verify these scenarios using the Firebase Emulator.
