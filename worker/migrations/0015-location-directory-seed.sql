-- 0015: expand location_directory from ~8 rows to full national district coverage, so the
-- checkout Zila/Upazila autocomplete has real suggestions everywhere in Bangladesh, not just a
-- handful of Dhaka neighbourhoods. UNIQUE(district, upazila) means this is safe to re-run —
-- anything already seeded is skipped, nothing existing is overwritten.
--
-- Coverage: all 64 districts get a "<District> Sadar" entry (every district has one, so this is
-- always a safe minimum). Dhaka additionally gets its 5 real upazilas plus the most commonly
-- typed Dhaka city neighbourhoods, since that's how most customers actually write their address.
-- This is a solid starting set, not the full 495-upazila list — the checkout field is free text,
-- so anything not yet in this table can still be typed manually and the order still goes through.

-- Barisal Division (6 districts)
INSERT OR IGNORE INTO location_directory (district, upazila, zone) VALUES
('Barguna', 'Barguna Sadar', 'outside-dhaka'),
('Barishal', 'Barishal Sadar', 'outside-dhaka'),
('Bhola', 'Bhola Sadar', 'outside-dhaka'),
('Jhalokathi', 'Jhalokathi Sadar', 'outside-dhaka'),
('Patuakhali', 'Patuakhali Sadar', 'outside-dhaka'),
('Pirojpur', 'Pirojpur Sadar', 'outside-dhaka'),

-- Chattogram Division (11 districts)
('Bandarban', 'Bandarban Sadar', 'outside-dhaka'),
('Brahmanbaria', 'Brahmanbaria Sadar', 'outside-dhaka'),
('Chandpur', 'Chandpur Sadar', 'outside-dhaka'),
('Chattogram', 'Chattogram Sadar', 'outside-dhaka'),
('Cumilla', 'Cumilla Sadar', 'outside-dhaka'),
('Cox''s Bazar', 'Cox''s Bazar Sadar', 'outside-dhaka'),
('Feni', 'Feni Sadar', 'outside-dhaka'),
('Khagrachhari', 'Khagrachhari Sadar', 'outside-dhaka'),
('Lakshmipur', 'Lakshmipur Sadar', 'outside-dhaka'),
('Noakhali', 'Noakhali Sadar', 'outside-dhaka'),
('Rangamati', 'Rangamati Sadar', 'outside-dhaka'),

-- Dhaka Division (13 districts)
('Dhaka', 'Dhaka Sadar', 'dhaka'),
('Faridpur', 'Faridpur Sadar', 'outside-dhaka'),
('Gazipur', 'Gazipur Sadar', 'outside-dhaka'),
('Gopalganj', 'Gopalganj Sadar', 'outside-dhaka'),
('Kishoreganj', 'Kishoreganj Sadar', 'outside-dhaka'),
('Madaripur', 'Madaripur Sadar', 'outside-dhaka'),
('Manikganj', 'Manikganj Sadar', 'outside-dhaka'),
('Munshiganj', 'Munshiganj Sadar', 'outside-dhaka'),
('Narayanganj', 'Narayanganj Sadar', 'outside-dhaka'),
('Narsingdi', 'Narsingdi Sadar', 'outside-dhaka'),
('Rajbari', 'Rajbari Sadar', 'outside-dhaka'),
('Shariatpur', 'Shariatpur Sadar', 'outside-dhaka'),
('Tangail', 'Tangail Sadar', 'outside-dhaka'),

-- Khulna Division (10 districts)
('Bagerhat', 'Bagerhat Sadar', 'outside-dhaka'),
('Chuadanga', 'Chuadanga Sadar', 'outside-dhaka'),
('Jashore', 'Jashore Sadar', 'outside-dhaka'),
('Jhenaidah', 'Jhenaidah Sadar', 'outside-dhaka'),
('Khulna', 'Khulna Sadar', 'outside-dhaka'),
('Kushtia', 'Kushtia Sadar', 'outside-dhaka'),
('Magura', 'Magura Sadar', 'outside-dhaka'),
('Meherpur', 'Meherpur Sadar', 'outside-dhaka'),
('Narail', 'Narail Sadar', 'outside-dhaka'),
('Satkhira', 'Satkhira Sadar', 'outside-dhaka'),

-- Mymensingh Division (4 districts)
('Jamalpur', 'Jamalpur Sadar', 'outside-dhaka'),
('Mymensingh', 'Mymensingh Sadar', 'outside-dhaka'),
('Netrokona', 'Netrokona Sadar', 'outside-dhaka'),
('Sherpur', 'Sherpur Sadar', 'outside-dhaka'),

-- Rajshahi Division (8 districts)
('Bogura', 'Bogura Sadar', 'outside-dhaka'),
('Joypurhat', 'Joypurhat Sadar', 'outside-dhaka'),
('Naogaon', 'Naogaon Sadar', 'outside-dhaka'),
('Natore', 'Natore Sadar', 'outside-dhaka'),
('Chapainawabganj', 'Chapainawabganj Sadar', 'outside-dhaka'),
('Pabna', 'Pabna Sadar', 'outside-dhaka'),
('Rajshahi', 'Rajshahi Sadar', 'outside-dhaka'),
('Sirajganj', 'Sirajganj Sadar', 'outside-dhaka'),

-- Rangpur Division (8 districts)
('Dinajpur', 'Dinajpur Sadar', 'outside-dhaka'),
('Gaibandha', 'Gaibandha Sadar', 'outside-dhaka'),
('Kurigram', 'Kurigram Sadar', 'outside-dhaka'),
('Lalmonirhat', 'Lalmonirhat Sadar', 'outside-dhaka'),
('Nilphamari', 'Nilphamari Sadar', 'outside-dhaka'),
('Panchagarh', 'Panchagarh Sadar', 'outside-dhaka'),
('Rangpur', 'Rangpur Sadar', 'outside-dhaka'),
('Thakurgaon', 'Thakurgaon Sadar', 'outside-dhaka'),

-- Sylhet Division (4 districts)
('Habiganj', 'Habiganj Sadar', 'outside-dhaka'),
('Moulvibazar', 'Moulvibazar Sadar', 'outside-dhaka'),
('Sunamganj', 'Sunamganj Sadar', 'outside-dhaka'),
('Sylhet', 'Sylhet Sadar', 'outside-dhaka'),

-- Dhaka District's real upazilas (outside Dhaka city proper, but still zone = dhaka for delivery)
('Dhaka', 'Dhamrai', 'dhaka'),
('Dhaka', 'Dohar', 'dhaka'),
('Dhaka', 'Keraniganj', 'dhaka'),
('Dhaka', 'Nawabganj', 'dhaka'),
('Dhaka', 'Savar', 'dhaka'),

-- Dhaka city — the neighbourhoods/thanas customers actually type most often
('Dhaka', 'Adabor', 'dhaka'),
('Dhaka', 'Badda', 'dhaka'),
('Dhaka', 'Banani', 'dhaka'),
('Dhaka', 'Bashundhara', 'dhaka'),
('Dhaka', 'Cantonment', 'dhaka'),
('Dhaka', 'Demra', 'dhaka'),
('Dhaka', 'Jatrabari', 'dhaka'),
('Dhaka', 'Kafrul', 'dhaka'),
('Dhaka', 'Khilgaon', 'dhaka'),
('Dhaka', 'Mirpur', 'dhaka'),
('Dhaka', 'Mohammadpur', 'dhaka'),
('Dhaka', 'Motijheel', 'dhaka'),
('Dhaka', 'Pallabi', 'dhaka'),
('Dhaka', 'Ramna', 'dhaka'),
('Dhaka', 'Rampura', 'dhaka'),
('Dhaka', 'Shyampur', 'dhaka'),
('Dhaka', 'Tejgaon', 'dhaka');
