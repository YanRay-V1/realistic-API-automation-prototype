package Public_API_Smoke_Flow.RequestMethods;

import Public_API_Smoke_Flow.POJOs.BookingPayload;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import net.serenitybdd.annotations.Step;
import net.serenitybdd.rest.SerenityRest;

public class DeleteBookingSteps {
    @Step("Delete a booking")
    public Response deleteBooking(String token,int booking) {
        return SerenityRest.given()
                .contentType(ContentType.JSON)
                .header("Accept", "application/json")
                .header("Cookie","token="+ token)
                .when()
                .delete("/booking/"+booking);
    }
}
