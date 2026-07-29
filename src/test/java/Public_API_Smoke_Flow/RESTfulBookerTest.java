package Public_API_Smoke_Flow;


import io.restassured.RestAssured;
import io.restassured.response.Response;
import net.serenitybdd.annotations.Steps;
import net.serenitybdd.core.Serenity;
import org.junit.jupiter.api.*;

import java.io.File;
import java.io.IOException;

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
import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

public class RESTfulBookerTest {

    private ObjectMapper mapper;

    @Steps
    AuthSteps authSteps = new AuthSteps();

    @Steps
    BookingSteps bookingSteps = new BookingSteps();

    @Steps
    GetBookingIdsStepsByName getBookingIdsStepsByName = new GetBookingIdsStepsByName();

    @BeforeAll
    static void setUp(){
        baseURI = "https://restful-booker.herokuapp.com";

    }

    @BeforeEach
    void separateSetUp(){
        mapper = new ObjectMapper();
    }

    @AfterEach
    void separateBreakDown(){
        mapper = null;
    }

    @Test
    void authApiTest() throws IOException {
        TokenPayload payload =  mapper.readValue(new File("src/test/resources/payloads/auth-token-request.json"), TokenPayload.class);


        Response response = authSteps.createToken(payload);
        String token = response.jsonPath().getString("token");
        Serenity.setSessionVariable("token").to(token);

        assertThat(response.statusCode(), equalTo(200));




    }

    @Test
    void createBookingApiTest() throws IOException{
        BookingPayload payload = mapper.readValue(new File("src/test/resources/payloads/create-booking-1.json"), BookingPayload.class);

        Response response = bookingSteps.createBooking(payload);
        assertThat(response.statusCode(), equalTo(200));
        int bookingId = response.jsonPath().getInt("bookingid");


    }

    @Test
    void getBookingApiTest() throws IOException {
        BookingPayload payload = mapper.readValue(new File("src/test/resources/payloads/create-booking.json"), BookingPayload.class);

        String firstname = payload.getFirstname();
        Response response = getBookingIdsStepsByName.retrieveIds(firstname);
        Serenity.setSessionVariable("BookingIdsForFirstName").to(response.getBody());
        assertThat(response.statusCode(), equalTo(200));

    }
//
//    @Test
//    void updateBookingApiTest(){
//
//    }
//
//    @Test
//    void deleteBookingApiTest(){
//
//    }
}
