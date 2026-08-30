-- ============================================================================
-- Digitizing paper registers: photograph a page, Claude Vision reads the
-- rows, a human matches each row to an employee and corrects anything
-- misread, and only then is it committed as a manual attendance_days entry.
--
-- Kept to superusers by default — this writes historical attendance data at
-- volume, and unlike the day-to-day features, getting the access model right
-- here is a decision for whoever owns the migration, not a default to guess.
-- ============================================================================

insert into public.permissions (key, module, action, label, description) values
  ('registers.import', 'attendance', 'manage',
   'Digitize paper registers', 'Import attendance from photographed registers, reviewed row by row before saving.');
