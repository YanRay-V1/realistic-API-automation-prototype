package Public_API_Smoke_Flow.RequestMethods;

import io.restassured.response.Response;
import net.serenitybdd.annotations.Step;
import net.serenitybdd.rest.SerenityRest;

public class GetBookingInfoSteps {
    @Step("Get a booking's details based on the booking's id")
    public Response getBookingInfo(int bookingId) {
        return SerenityRest.given()
                .header("Accept", "application/json")
                .when()
                .get("/booking/" + bookingId);
    }
}