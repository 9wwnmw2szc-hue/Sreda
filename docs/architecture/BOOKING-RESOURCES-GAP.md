# Booking resources (rental / studio) — architecture gap

Current booking domain is specialist-based:

- `booking_specialist`
- service ↔ specialist links
- weekly schedule / exceptions per specialist

Industry preset `rental` uses presentation terminology («Ресурс») and
`bookingPreset: resource_datetime_duration`, but **does not** introduce a
separate Resource engine.

## Safe path now

Treat a room / equipment / workspace as a `booking_specialist` row with a
clear name (e.g. «Студия A»). Availability and concurrency stay on the
existing specialist schedule + booking conflict path.

## Future extension (not in this PR)

A Resource model could add:

- `kind`: room | equipment | workspace | vehicle | other
- capacity / concurrent bookings
- optional service duration override

Until that lands safely:

- do **not** fork booking engines per industry
- do **not** break specialist booking
- UI terminology may say «Ресурс» while the backend entity remains specialist
