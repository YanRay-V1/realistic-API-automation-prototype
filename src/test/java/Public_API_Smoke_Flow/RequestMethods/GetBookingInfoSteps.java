package Public_API_Smoke_Flow.RequestMethods;

import Public_API_Smoke_Flow.ScenarioContext;
import io.restassured.response.Response;
import net.serenitybdd.annotations.Step;
import net.serenitybdd.rest.SerenityRest;

public class GetBookingInfoSteps {
    private final ScenarioContext scenarioContext;

    public GetBookingInfoSteps(ScenarioContext scenarioContext){
        this.scenarioContext = scenarioContext;
    }

    @Step("Get a booking's details based on the booking's id")
    public Response getBookingInfo() {
        return SerenityRest.given()
                .header("Accept", "application/json")
                .when()
                .get("/booking/" + scenarioContext.getBookingId());
    }
}