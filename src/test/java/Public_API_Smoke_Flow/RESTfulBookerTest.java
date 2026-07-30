package Public_API_Smoke_Flow;


import Public_API_Smoke_Flow.POJOs.BookingPayload;
import Public_API_Smoke_Flow.POJOs.TokenPayload;
import Public_API_Smoke_Flow.RequestMethods.*;
import groovyjarjarantlr4.runtime.Token;
import io.restassured.response.Response;
import net.serenitybdd.annotations.Steps;
import net.serenitybdd.core.Serenity;
import net.serenitybdd.junit5.SerenityJUnit5Extension;
import org.junit.jupiter.api.*;
import java.io.File;
import java.io.IOException;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.extension.ExtendWith;

import static io.restassured.RestAssured.*;
import static org.hamcrest.MatcherAssert.*;
import static org.hamcrest.Matchers.*;

@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@ExtendWith(SerenityJUnit5Extension.class)
public class RESTfulBookerTest {

    private static final ScenarioContext scenarioContext = new ScenarioContext();
    private ObjectMapper mapper;

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

    @Steps
    AuthSteps authSteps = new AuthSteps();
    @Order(1)
    @DisplayName("Valid authentication API request/response.")
    @Test
    void validAuthApiTest() throws IOException {
        TokenPayload payload = mapper.readValue(new File("src/test/resources/payloads/valid-auth-token-request.json"), TokenPayload.class);

        Response response = authSteps.createToken(payload);
        String authToken = response.jsonPath().getString("token");
        scenarioContext.setToken(authToken);
        assertThat(response.statusCode(), equalTo(200));
    }

    @Steps
    BookingSteps bookingSteps = new BookingSteps();
    @Order(2)
    @DisplayName("Valid creation of a booking.")
    @Test
    void createBookingApiTest() throws IOException{
        BookingPayload payload = mapper.readValue(new File("src/test/resources/payloads/create-booking-1.json"), BookingPayload.class);

        Response response = bookingSteps.createBooking(payload);
        assertThat(response.statusCode(), equalTo(200));
        scenarioContext.setBookingId(response.jsonPath().getInt("bookingid"));

        assertThat(response.jsonPath().getInt("bookingid"), is(not(nullValue())));
        String actualFName = response.jsonPath().getString("booking.firstname");
        String expectedFName = payload.getFirstname();
        assertThat(actualFName, equalTo(expectedFName));
        assertThat(response.jsonPath().getString("booking.lastname"), equalTo(payload.getLastname()));
    }

    @Steps
    GetBookingInfoSteps getBookingInfoSteps = new GetBookingInfoSteps(scenarioContext);
    @Order(3)
    @DisplayName("Getting booking details using the booking id.")
    @Test
    void getValidBookingInfoTest(){
        Response response = getBookingInfoSteps.getBookingInfo();
        assertThat(response.statusCode(), equalTo(200));
    }

    @Steps
    UpdateBookingSteps updateBookingSteps = new UpdateBookingSteps(scenarioContext);
    @Order(4)
    @DisplayName("Updating a booking using a valid booking id and token.")
    @Test
    void updateBookingApiTest() throws IOException {
        BookingPayload payload = mapper.readValue(new File("src/test/resources/payloads/update-name-booking.json"), BookingPayload.class);

        Response response = updateBookingSteps.updateBooking(payload);
        assertThat(response.statusCode(), equalTo(200));
    }

    @Steps
    DeleteBookingSteps deleteBookingSteps = new DeleteBookingSteps(scenarioContext);
    @Order(5)
    @DisplayName("Deleting a booking using a valid booking id and token.")
    @Test
    void deleteBookingApiTest(){
        Response response = deleteBookingSteps.deleteBooking();
        assertThat(response.statusCode(), equalTo(201));
    }

    @Order(6)
    @Test
    void getInvalidBookingInfoTest(){
        Response response = getBookingInfoSteps.getBookingInfo();
        assertThat(response.statusCode(), equalTo(404));
    }
}