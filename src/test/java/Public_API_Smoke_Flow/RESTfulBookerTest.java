package Public_API_Smoke_Flow;


import Public_API_Smoke_Flow.POJOs.BookingPayload;
import Public_API_Smoke_Flow.POJOs.TokenPayload;
import Public_API_Smoke_Flow.RequestMethods.*;
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

    @Steps
    AuthSteps authSteps = new AuthSteps();

    @Steps
    BookingSteps bookingSteps = new BookingSteps();

    @Steps
    GetBookingIdsByNameSteps getBookingIdsStepsByName = new GetBookingIdsByNameSteps();

    @Steps
    UpdateBookingSteps updateBookingSteps = new UpdateBookingSteps();

    @Steps
    DeleteBookingSteps deleteBookingSteps = new DeleteBookingSteps();

    @Steps
    GetBookingInfoSteps getBookingInfoSteps = new GetBookingInfoSteps();

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
        TokenPayload payload = mapper.readValue(new File("src/test/resources/payloads/auth-token-request.json"), TokenPayload.class);

        Response response = authSteps.createToken(payload);
        assertThat(response.statusCode(), equalTo(200));
        scenarioContext.setToken(response.jsonPath().getString("token"));
    }

    @Order(2)
    @Test
    void createBookingApiTest() throws IOException{
        BookingPayload payload = mapper.readValue(new File("src/test/resources/payloads/create-booking-1.json"), BookingPayload.class);

        Response response = bookingSteps.createBooking(payload);
        assertThat(response.statusCode(), equalTo(200));
        assertThat(response.jsonPath().getInt("bookingid"), is(not(nullValue())));
        assertThat(response.jsonPath().getInt("bookingid"), isA(int.class));
        scenarioContext.setBookingId(response.jsonPath().getInt("bookingid"));
    }

    @Order(3)
    @Test
    void getBookingListApiTest() throws IOException {
        BookingPayload payload = mapper.readValue(new File("src/test/resources/payloads/create-booking.json"), BookingPayload.class);

        String firstname = payload.getFirstname();
        Response response = getBookingIdsStepsByName.retrieveIds(firstname);
        assertThat(response, is(not(nullValue())));
        assertThat(response.statusCode(), equalTo(200));

        String responseBody = response.asString();
        assertThat(responseBody, containsString("" + scenarioContext.getBookingId() + ""));
    }

    @Order(4)
    @Test
    void updateBookingApiTest() throws IOException {
        BookingPayload payload = mapper.readValue(new File("src/test/resources/payloads/update-name-booking.json"), BookingPayload.class);

        Response response = updateBookingSteps.updateBooking(payload, scenarioContext.getToken(), scenarioContext.getBookingId());
        assertThat(response.statusCode(), equalTo(200));
    }

    @Order(5)
    @Test
    void getBookingInfoTest(){
        Response response = getBookingInfoSteps.getBookingInfo(scenarioContext.getBookingId());
        assertThat(response.statusCode(), equalTo(200));
    }

    @Order(6)
    @Test
    void deleteBookingApiTest(){
        Response response = deleteBookingSteps.deleteBooking(scenarioContext.getToken(), scenarioContext.getBookingId());
        assertThat(response.statusCode(), equalTo(201));
    }
}