package Public_API_Smoke_Flow;


import Public_API_Smoke_Flow.POJOs.BookingPayload;
import Public_API_Smoke_Flow.POJOs.TokenPayload;
import Public_API_Smoke_Flow.RequestMethods.AuthSteps;
import Public_API_Smoke_Flow.RequestMethods.BookingSteps;
import Public_API_Smoke_Flow.RequestMethods.GetBookingIdsByNameSteps;
import Public_API_Smoke_Flow.RequestMethods.UpdateBookingSteps;
import io.restassured.response.Response;
import net.serenitybdd.annotations.Steps;
import net.serenitybdd.core.Serenity;
import org.junit.jupiter.api.*;
import java.util.HashMap;
import java.io.File;
import java.io.IOException;

import com.fasterxml.jackson.databind.ObjectMapper;

import static io.restassured.RestAssured.*;
import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
public class RESTfulBookerTest {

    private ObjectMapper mapper;
    private static HashMap<String,Response> runtimeContextHashmap = new HashMap<>();
    @Steps
    AuthSteps authSteps = new AuthSteps();

    @Steps
    BookingSteps bookingSteps = new BookingSteps();

    @Steps
    GetBookingIdsByNameSteps getBookingIdsStepsByName = new GetBookingIdsByNameSteps();

    @Steps
    UpdateBookingSteps updateBookingSteps = new UpdateBookingSteps();

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

    @Order(1)
    @Test
    void authApiTest() throws IOException {
        TokenPayload payload =  mapper.readValue(new File("src/test/resources/payloads/auth-token-request.json"), TokenPayload.class);


        Response response = authSteps.createToken(payload);
        runtimeContextHashmap.put("tokenResponse",response);
        assertThat(response.statusCode(), equalTo(200));
        System.out.println(runtimeContextHashmap.get("tokenResponse"));
    }

    @Order(2)
    @Test
    void createBookingApiTest() throws IOException{
        BookingPayload payload = mapper.readValue(new File("src/test/resources/payloads/create-booking-1.json"), BookingPayload.class);

        Response response = bookingSteps.createBooking(payload);
        runtimeContextHashmap.put("bookingidResponse",response);
        assertThat(response.statusCode(), equalTo(200));
        System.out.println(runtimeContextHashmap.get("bookingidResponse"));

    }

    @Order(3)
    @Test
    void getBookingApiTest() throws IOException {
        BookingPayload payload = mapper.readValue(new File("src/test/resources/payloads/create-booking.json"), BookingPayload.class);

        String firstname = payload.getFirstname();
        Response response = getBookingIdsStepsByName.retrieveIds(firstname);
        assertThat(response.statusCode(), equalTo(200));
        System.out.println(runtimeContextHashmap);

    }

    @Order(4)
    @Test
    void updateBookingApiTest() throws IOException {
        BookingPayload payload = mapper.readValue(new File("src/test/resources/payloads/update-name-booking.json"), BookingPayload.class);

        Response tokenResponse = runtimeContextHashmap.get("tokenResponse");
        String token = tokenResponse.jsonPath().getString("token");
        Response bookingidResponse = runtimeContextHashmap.get("bookingidResponse");
        int bookingId = bookingidResponse.jsonPath().getInt("bookingid");
        Response response = updateBookingSteps.updateBooking(payload, token, bookingId);
        assertThat(response.statusCode(), equalTo(200));
        System.out.println(runtimeContextHashmap);
    }
//
//    @Test
//    void deleteBookingApiTest(){
//
//    }
}
