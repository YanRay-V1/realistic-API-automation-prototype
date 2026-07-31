package Public_API_Smoke_Flow.Yaml;


import Public_API_Smoke_Flow.ScenarioContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import io.restassured.response.Response;
import net.serenitybdd.junit5.SerenityJUnit5Extension;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.extension.ExtendWith;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static io.restassured.RestAssured.baseURI;
import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

@ExtendWith(SerenityJUnit5Extension.class)
public class YamlFlowRunner {

    private static final ObjectMapper YAML_MAPPER = new ObjectMapper(new YAMLFactory());
    private static final ObjectMapper JSON_MAPPER = new ObjectMapper();

    private static final ScenarioContext scenarioContext = new ScenarioContext();
    private static final ActionRegistry actionRegistry = new ActionRegistry(scenarioContext);

    @BeforeAll
    static void setUp() {
        baseURI = "https://restful-booker.herokuapp.com";
    }

    @TestFactory
    List<DynamicTest> runBookingFlow() throws Exception {
        return buildTestsFromYaml("src/test/resources/flows/booking-flow.yaml");
    }

    private List<DynamicTest> buildTestsFromYaml(String yamlPath) throws Exception {
        YamlFlow flow = YAML_MAPPER.readValue(new File(yamlPath), YamlFlow.class);
        List<DynamicTest> tests = new ArrayList<>();

        for (YamlStep step : flow.getSteps()) {
            tests.add(DynamicTest.dynamicTest(step.getName(), () -> executeStep(step)));
        }
        return tests;
    }

    private void executeStep(YamlStep step) throws Exception {
        YamlStepContext context = new YamlStepContext(step, JSON_MAPPER);
        YamlAction action = actionRegistry.get(step.getAction());

        Response response = action.execute(context);

        if (step.getExpectedStatus() != null) {
            assertThat("Status code for step '" + step.getName() + "'",
                    response.statusCode(), equalTo(step.getExpectedStatus()));
        }

        if (step.getAssertions() != null) {
            for (Map.Entry<String, String> assertion : step.getAssertions().entrySet()) {
                assertThat("JSON field '" + assertion.getKey() + "' for step '" + step.getName() + "'",
                        response.jsonPath().getString(assertion.getKey()),
                        equalTo(assertion.getValue()));
            }
        }

        if (step.getSaveToContext() != null) {
            for (Map.Entry<String, String> save : step.getSaveToContext().entrySet()) {
                String jsonField = save.getKey();
                String contextKey = save.getValue();
                String value = response.jsonPath().getString(jsonField);

                if ("token".equalsIgnoreCase(contextKey)) {
                    scenarioContext.setToken(value);
                } else if ("bookingId".equalsIgnoreCase(contextKey)) {
                    scenarioContext.setBookingId(Integer.valueOf(value));
                } else {
                    throw new IllegalArgumentException(
                            "Unsupported saveToContext key '" + contextKey + "'. " +
                                    "ScenarioContext only supports 'token' and 'bookingId' - " +
                                    "extend ScenarioContext if you need more.");
                }
            }
        }
    }
}