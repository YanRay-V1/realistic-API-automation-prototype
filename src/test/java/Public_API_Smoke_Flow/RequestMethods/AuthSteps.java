package Public_API_Smoke_Flow.RequestMethods;

import Public_API_Smoke_Flow.POJOs.TokenPayload;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import net.serenitybdd.annotations.Step;
import net.serenitybdd.rest.SerenityRest;

public class AuthSteps {
    @Step("Create New Auth Token")
    public Response createToken(TokenPayload tokenPayload){
        return SerenityRest.given()
                .contentType(ContentType.JSON)
                .body(tokenPayload)
                .when()
                .post("/auth");
    }
}
