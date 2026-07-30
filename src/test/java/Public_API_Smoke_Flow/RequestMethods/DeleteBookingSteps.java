package Public_API_Smoke_Flow.RequestMethods;


import Public_API_Smoke_Flow.PlaceholderResolver;
import Public_API_Smoke_Flow.ScenarioContext;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import net.serenitybdd.annotations.Step;
import net.serenitybdd.rest.SerenityRest;

import java.util.HashMap;
import java.util.Map;

public class DeleteBookingSteps {

    private final ScenarioContext scenarioContext;

    public DeleteBookingSteps(ScenarioContext scenarioContext){
        this.scenarioContext = scenarioContext;
    }

    @Step("Delete a booking")
    public Response deleteBooking() {
        String cookieTemplate = "token={{token}}";
        Map<String,String> values = scenarioContext.asPlaceholderMap();

        String resolvedCookie = PlaceholderResolver.resolve(cookieTemplate,values);

        return SerenityRest.given()
                .contentType(ContentType.JSON)
                .header("Accept", "application/json")
                .header("Cookie",resolvedCookie)
                .when()
                .delete("/booking/"+ scenarioContext.getBookingId());
    }
}
