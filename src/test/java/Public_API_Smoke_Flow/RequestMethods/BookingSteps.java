package Public_API_Smoke_Flow.RequestMethods;

import Public_API_Smoke_Flow.POJOs.BookingPayload;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import net.serenitybdd.annotations.Step;
import net.serenitybdd.rest.SerenityRest;

public class BookingSteps {
    @Step("Create a new booking")
    public Response createBooking(BookingPayload payload) {
        return SerenityRest.given()
                .contentType(ContentType.JSON)
                .header("Accept", "application/json")
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
                .body(payload)
                .when()
                .post("/booking");
    }
}
