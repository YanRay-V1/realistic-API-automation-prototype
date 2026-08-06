package Public_API_Smoke_Flow;


import Public_API_Smoke_Flow.POJOs.BookingPayload;
import Public_API_Smoke_Flow.POJOs.TokenPayload;
import Public_API_Smoke_Flow.RequestMethods.*;
import io.restassured.response.Response;
import net.serenitybdd.annotations.Steps;
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

@Deprecated
public class RestfulBookerTest {

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
    GetBookingIds getBookingIds = new GetBookingIds();

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
        String actualFName = response.jsonPath().getString("booking.firstname");String expectedFName = payload.getFirstname();
        assertThat(actualFName, equalTo(expectedFName));
        assertThat(response.jsonPath().getString("booking.lastname"), equalTo(payload.getLastname()));
    }

    @Steps
    GetBookingInfoSteps getBookingInfoSteps = new GetBookingInfoSteps(scenarioContext);
    @Order(3)
    @DisplayName("Getting booking details using the booking id.")
    @Test
    void getValidBookingInfoTest() throws IOException {
        BookingPayload testpayload = mapper.readValue(new File("src/test/resources/payloads/create-booking-1.json"), BookingPayload.class);

        Response response = getBookingInfoSteps.getBookingInfo();
        assertThat(response.statusCode(), equalTo(200));
        assertThat(response.jsonPath().getString("firstname"), equalTo(testpayload.getFirstname()));
        assertThat(response.jsonPath().getString("lastname"), equalTo(testpayload.getLastname()));
        assertThat(response.jsonPath().getDouble("totalprice"), equalTo(testpayload.getTotalprice()));
        assertThat(response.jsonPath().getString("bookingdates.checkin"), equalTo(testpayload.getBookingdates().getCheckin()));
        assertThat(response.jsonPath().getString("bookingdates.checkout"), equalTo(testpayload.getBookingdates().getCheckout()));
        assertThat(response.jsonPath().getString("additionalneeds"), equalTo(testpayload.getAdditionalneeds()));
    }

    @Steps
    UpdateBookingSteps updateBookingSteps = new UpdateBookingSteps(scenarioContext);
    @Order(4)
    @DisplayName("Updating a booking using a valid booking id and token.")
    @Test
    void updateBookingApiTest() throws IOException {
        BookingPayload updatepayload = mapper.readValue(new File("src/test/resources/payloads/update-name-booking.json"), BookingPayload.class);
        Response currentPayload = getBookingInfoSteps.getBookingInfo();
        assertThat(currentPayload.jsonPath().getString("lastname"),equalTo("Brown"));
        Response response = updateBookingSteps.updateBooking(updatepayload);
        assertThat(response.jsonPath().getString("lastname"),equalTo("Hustle"));
        assertThat(response.statusCode(), equalTo(200));
    }

    @Steps
    DeleteBookingSteps deleteBookingSteps = new DeleteBookingSteps(scenarioContext);
    @Order(5)
    @DisplayName("Deleting a booking using a valid booking id and token.")
    @Test
    void deleteBookingApiTest(){
        Response responseIds = getBookingIds.retrieveIds();
        assertThat(responseIds.jsonPath().getList("bookingid"),hasItem(scenarioContext.getBookingId()));
        Response response = deleteBookingSteps.deleteBooking();
        assertThat(response.statusCode(), equalTo(201));
        assertThat(responseIds.jsonPath().getList("bookingid"),hasItem(scenarioContext.getBookingId()));
        scenarioContext.setBookingId(null);

    }

    @Order(6)
    @Test
    void getInvalidBookingInfoTest(){

        Response response = getBookingInfoSteps.getBookingInfo();
        assertThat(response.statusCode(), equalTo(404));
    }

}