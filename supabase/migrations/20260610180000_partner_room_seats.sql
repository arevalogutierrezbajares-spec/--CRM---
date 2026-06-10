-- Seat-limited guest sign-in. The owner caps how many guests may claim a seat
-- (enter their email at the gate); they can also pre-add expected guests by name
-- so a visitor can pick their name from a dropdown and attach their email.
alter table partner_rooms add column if not exists seat_limit integer;

-- Pre-added guests have a name but no email until claimed.
alter table partner_room_members alter column email drop not null;
alter table partner_room_members add column if not exists claimed_at timestamptz;
