package Public_API_Smoke_Flow.RequestMethods;

import io.restassured.http.ContentType;
import io.restassured.response.Response;
import net.serenitybdd.annotations.Step;
import net.serenitybdd.rest.SerenityRest;

import java.util.HashMap;
import java.util.Map;
public class GetBookingIds {
    @Step("Get a list of booking Ids")
    public Response retrieveIds() {
        return SerenityRest.given()
                .contentType(ContentType.JSON)
                .when()
                .get("/booking");
    }
}
