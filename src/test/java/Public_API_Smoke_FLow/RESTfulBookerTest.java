package Public_API_Smoke_FLow;


import org.junit.jupiter.api.*;

import net.serenitybdd.*;

import io.restassured.RestAssured.*;
import io.restassured.matcher.RestAssuredMatchers.*;
import org.hamcrest.Matchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;

import static io.restassured.RestAssured.*;

public class RESTfulBookerTest {

    private  String AuthToken;

    @BeforeAll
    static void SetUp(){
        String TokenCredentials = """
            {
                "username":"admin",
                "password":"password123"
            }
            """;

    }
}
