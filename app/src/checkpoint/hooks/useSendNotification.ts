import { useState, useEffect } from "react";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { checkpointNear } from "../utils/checkpoint-near";
import { useUser } from "@/src/user/context/user_context";
import { NotificationDataSourceImpl } from "../infrastructure/datasources/notification_datasource";
import { PROJECT_ID } from "@/common/constants/projectId";
import { NotificationEntity } from "../domain/entities/notification_entity";

interface UseFormNotificationProps {
  setIsModalVisible: (visible: boolean) => void;
  setIsActiveRoute: (active: boolean) => void;
  isActiveRoute: boolean;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface UseFormNotificationReturn {
  contactPhone: string;
  handleContactPhoneChange: (text: string) => void;
  handlePressStartRoute: () => void;
  location: Location.LocationObject | null;
  checkpoints: CheckpointRes[];
  stopTrackingLocation: () => void;
}

export interface CheckpointRes {
  id: number;
  name: string;
  coords: {
    type: string;
    coordinates: [number, number];
  };
}

export const useFormNotification = (
  setIsModalVisible: UseFormNotificationProps["setIsModalVisible"],
  setIsActiveRoute: UseFormNotificationProps["setIsActiveRoute"],
  isActiveRoute: UseFormNotificationProps["isActiveRoute"]
): UseFormNotificationReturn => {
  const [contactPhone, setContactPhone] = useState<string>("");
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationSubscription, setLocationSubscription] = useState<Location.LocationSubscription | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointRes[]>([]);

  const notificationDataSourceImpl = new NotificationDataSourceImpl();

  const { user } = useUser();
  console.log({ user });

  const handleContactPhoneChange = (text: string) => {
    setContactPhone(text);
    console.log(text);
  };

  const fetchCheckpoints = async () => {
    try {
      const response = await notificationDataSourceImpl.fetchCheckpoints(user?.id || "");
      setCheckpoints(response);
    } catch (error) {
      console.error("Error al obtener los checkpoints:", error);
    }
  };

  const startTrackingLocation = async () => {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== "granted") {
      console.log("Permission to access location was denied");
      return;
    }

    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 5,
      },
      (currentLocation) => {
        setLocation(currentLocation);
        console.log("Location updated:", currentLocation);
      }
    );

    setLocationSubscription(subscription);
  };

  const stopTrackingLocation = () => {
    if (locationSubscription) {
      locationSubscription.remove();
      setLocationSubscription(null);
    }
    console.log("stopped tracking location");
  };

  const handlePressStartRoute = () => {
    setIsModalVisible(false);
    setIsActiveRoute(true);
    startTrackingLocation();
  };

  useEffect(() => {
    fetchCheckpoints();
  }, [isActiveRoute]);

  // Configurar notificaciones

  const registerForPushNotificationsAsync = async () => {
    let token;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Failed to get push token for push notification!");
      return;
    }

    try {
      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId: PROJECT_ID,
        })
      ).data;
      console.log("Push token:", token);
    } catch (error) {
      console.error("Error al obtener el token de notificación:", error);
    }

    return token;
  };

  const sendNotification = async () => {
    if (location) {
      const checkpoint: number | null = checkpointNear(checkpoints, {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (checkpoint !== null) {
        console.log("enviando notificación del checkpoint:", checkpoint);
        try {
          const notification: NotificationEntity = {
            checkpointId: checkpoint,
            contactPhone,
            userId: user?.id || "",
          };
          await notificationDataSourceImpl.sendNotification(notification);

          // Notificación de éxito
          const checkpointName = checkpoints.find((c) => c.id === checkpoint)?.name;
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Notificación enviada",
              body: `La notificación de ${checkpointName} se ha enviado a tu contacto.`,
            },
            trigger: null,
          });
        } catch (error) {
          console.error("Error al enviar la notificación:", error);

          // Notificación de error
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Error",
              body: "Hubo un problema al enviar la notificación.",
            },
            trigger: null,
          });
        }
        setCheckpoints((prev) => prev.filter((c) => c.id !== checkpoint));
        console.log("Checkpoint cercano:", checkpoint);
      }
    }
  };

  useEffect(() => {
    sendNotification();
  }, [location]);

  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  return {
    contactPhone,
    handleContactPhoneChange,
    handlePressStartRoute,
    location,
    checkpoints,
    stopTrackingLocation,
  };
};
