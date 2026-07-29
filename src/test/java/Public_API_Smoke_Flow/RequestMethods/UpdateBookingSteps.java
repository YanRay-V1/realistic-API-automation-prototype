package Public_API_Smoke_Flow.RequestMethods;

import Public_API_Smoke_Flow.POJOs.BookingPayload;
import io.restassured.response.Response;
import net.serenitybdd.annotations.Step;
import net.serenitybdd.rest.SerenityRest;



public class UpdateBookingSteps {

    @Step("Update a booking with the payload using the booking id to identify and the token to have access to do such changes")
    public Response updateBooking(BookingPayload payload, String token,int booking) {

        return SerenityRest.given()
                .header("Content-Type","application/json")
                .header("Accept","application/json")
                .header("Cookie", "token=" + token)
                .body(payload)
                .when()
                .put("/booking/"+ booking);
    }
}
