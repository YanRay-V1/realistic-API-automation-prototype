# realistic-API-automation-prototype


## Set Up
1. Clone Repository
2. Open Cloned Repo Using IntelliJ IDEA
3. go to the left sidebar and click on maven
4. click 'execute maven goal' button
5. choose either:
   - choose 'clean' from the list followed by 'verify'
   - type 'clean verify'
6. press Enter

```bash
mvn clean verify
```

### Architecture
realistic-API-automation-prototype/
|
└src/test/java/Public_API_Smoke_Flow/POJOs/
└─────────────────────────────────────────BookingDates.java
└─────────────────────────────────────────BookingPayload.java
└─────────────────────────────────────────TokenPayload.java
└-src/test/java/Public_API_Smoke_Flow/RequestMethods/
└────────────────────────────────────────────────────AuthSteps.java
└────────────────────────────────────────────────────BookingSteps.java
└────────────────────────────────────────────────────DeleteBookingSteps.java
└────────────────────────────────────────────────────GetBookingIds.java
└────────────────────────────────────────────────────GetBookingInfoSteps.java
└────────────────────────────────────────────────────UpdateBookingSteps.java
└-src/test/java/Public_API_Smoke_Flow/
└─────────────────────────────────────PlaceholderResolver.java
└─────────────────────────────────────RestfulBookerTest.java
└─────────────────────────────────────ScenarioContext.java
└-src/test/resources/payloads/
└─────────────────────────────create-booking.json
└─────────────────────────────create-booking_1.json
└─────────────────────────────update-checkout-booking.json
└─────────────────────────────update-name-booking.json
└─────────────────────────────valid-auth-token-request.json

- /test/java/Public_API_Smoke_Flow/POJOs: has Plain Old Java Objects that are used by the Jackson objecy mapper so when parsing a JSON file is done it has a blueprint of how a java object would look like.
- /test/java/Public_API_Smoke_Flow/RequestMethods: this folder houses the API requests that are made to the restful-booker API.
-  /test/java/Public_API_Smoke_Flow: has the main testing class along with a scenario context class and a placeholder resolver to resolve {{token}} placeholders found in API requests.
-  /test/resources/payloads: has JSON files that are used as payloads for the API requests.


### Capture & reuse of runtime variables
  once the RestfulBookerTest class is called, an object of the ScenarioContext class is made, once a request is made in the validAuthApiTest method is made, the token received from the response is stored as a variable of the scenarioContext object using a setter. another runtime variable is stored that is gotten from the CreateBooking API, once the createBookingApiTest response is received, the bookingid is stored as a attribute of the scenarioContext object, whenever an API call requires a token or bookingid(UpdateBooking, DeleteBooking, GetBooking).


### Known Limitations & possible improvements
- currently some assertions regarding payloads are static.
  - make dynamic assertions that work with all types of payloads.
- currently the testing class can only test a single booking/booking id at a time
  - make it so that multiple bookings can be made.
