# Survey Template Contract

STOP before creating a service Survey page and ask for the exact GHL survey embed for that service.

The Survey is independent from the calendar. GHL owns its questions and redirect logic. Its successful redirect must point to the service-specific calendar page and pass:

```text
?fullName={{contact.name}}&email={{contact.email}}&phone={{contact.phone}}
```

The My Drip Nurse calendar reads those values once, removes them from its iframe URL and uses them only for the booking workflow.
