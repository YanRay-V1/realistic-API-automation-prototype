package Public_API_Smoke_Flow.RequestMethods;

import Public_API_Smoke_Flow.POJOs.BookingPayload;
import Public_API_Smoke_Flow.PlaceholderResolver;
import Public_API_Smoke_Flow.ScenarioContext;
import io.restassured.response.Response;
import net.serenitybdd.annotations.Step;
import net.serenitybdd.rest.SerenityRest;

import java.util.Map;
import java.util.HashMap;

public class UpdateBookingSteps {

    private final ScenarioContext scenarioContext;

    public UpdateBookingSteps(ScenarioContext scenarioContext){
        this.scenarioContext = scenarioContext;
    }

    @Step("Update a booking with the payload using the booking id to identify and the token to have access to do such changes")
    public Response updateBooking(BookingPayload payload) {
        String cookieTemplate = "token={{token}}";
        Map<String,String> values = scenarioContext.asPlaceholderMap();

        String resolvedCookie = PlaceholderResolver.resolve(cookieTemplate,values);

        return SerenityRest.given()
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .header("Cookie", resolvedCookie)
                .body(payload)
                .when()
                .put("/booking/" + scenarioContext.getBookingId());
    }
}